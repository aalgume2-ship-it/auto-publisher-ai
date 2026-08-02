/**
 * TenantGuard — guard 2/5 (ADR-025 chain). Establishes TENANT ISOLATION for
 * tenant-scoped routes:
 *
 *   1. orgId comes from route param `:orgId` or `X-Org-Id` header (declared by
 *      @TenantRequired()); missing → VALIDATION_FAILED.
 *   2. apikey principals are pinned to their own org — any other org on the
 *      path is TENANT_VIOLATION (masked 404, oracle defense).
 *   3. user principals must hold an ACTIVE OrganizationMember row.
 *      Cross-org ids and non-members are indistinguishable: both 404.
 *   4. IP allow list (docs/API.md §9.2): if the org has ANY allowlist entries,
 *      the caller ip must match one CIDR → else IP_NOT_ALLOWED. Evaluation is
 *      here (post-membership) because the policy belongs to the resolved org —
 *      the ADR-025 chain line is clarified accordingly.
 *   5. Patches RequestContext { organizationId, membership } for RBAC/credits.
 */
import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { UuidV7Schema } from '@aca/shared';
import type { DbClient } from '@aca/database';
import { apiErrors } from '../errors/api-error.js';
import { patchRequestContext, requestContext, type SystemRoleName } from '../context/request-context.js';
import { ipInAnyCidr } from './ip-cidr.js';
import { PRISMA } from '../prisma.provider.js';

export const TENANT_REQUIRED_KEY = 'aca:tenant-required';
/** Declares that the route is tenant-scoped (tenant resolution + isolation enforced). */
export const TenantRequired = () => SetMetadata(TENANT_REQUIRED_KEY, true);

export interface TenantDecisionInput {
  principalKind: 'user' | 'apikey';
  principalOrgId?: string | null;
  requestedOrgId: string;
}

/** Pure isolation decision (unit-tested directly). */
export function decideTenantAccess(input: TenantDecisionInput): void {
  if (!UuidV7Schema.safeParse(input.requestedOrgId).success) {
    throw apiErrors.validationFailed([{ path: 'orgId', code: 'invalid_string', message: 'orgId must be a uuidv7' }]);
  }
  if (input.principalKind === 'apikey' && input.principalOrgId !== input.requestedOrgId) {
    throw apiErrors.tenantViolation(); // api keys never leave their org
  }
}

const SYSTEM_ROLES: ReadonlySet<string> = new Set(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']);

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PRISMA) private readonly prisma: DbClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(TENANT_REQUIRED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required !== true) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const params = (req.params ?? {}) as Record<string, string | undefined>;
    const headerOrg = req.headers['x-org-id'];
    const requestedOrgId = params['orgId'] ?? (typeof headerOrg === 'string' ? headerOrg : undefined);
    if (requestedOrgId === undefined || requestedOrgId === '') {
      throw apiErrors.validationFailed([{ path: 'orgId', code: 'invalid_type', message: 'organization id required (path param or X-Org-Id)' }]);
    }

    const ctx = requestContext();
    const principal = ctx.principal;
    if (principal === null) throw apiErrors.unauthenticated();

    decideTenantAccess({
      principalKind: principal.kind,
      principalOrgId: principal.kind === 'apikey' ? principal.orgId : null,
      requestedOrgId,
    });

    if (principal.kind === 'user') {
      const membership = await this.prisma.organizationMember.findUnique({
        where: { orgId_userId: { orgId: requestedOrgId, userId: principal.userId } },
        select: { role: true, status: true, customRoleId: true },
      });
      if (membership === null || membership.status !== 'ACTIVE' || !SYSTEM_ROLES.has(membership.role)) {
        throw apiErrors.tenantViolation();
      }
      patchRequestContext({
        organizationId: requestedOrgId,
        membership: { role: membership.role as SystemRoleName, customRoleId: membership.customRoleId },
      });
    } else {
      patchRequestContext({
        organizationId: requestedOrgId,
        membership: { role: 'OWNER', customRoleId: null }, // api keys act with key scopes, role is nominal
      });
    }

    await this.enforceIpAllowList(requestedOrgId, ctx.ip);
    return true;
  }

  private async enforceIpAllowList(orgId: string, ip: string): Promise<void> {
    const entries = await this.prisma.ipAllowListEntry.findMany({
      where: { orgId },
      select: { cidr: true },
    });
    if (entries.length === 0) return; // no policy configured → open
    if (ipInAnyCidr(ip, entries.map((e: { cidr: string }) => e.cidr))) return;
    throw apiErrors.ipNotAllowed(ip);
  }
}
