/**
 * RbacGuard — guard 3/5 (ADR-025 chain). CAPABILITY checks only (ADR-012):
 * routes declare `@RequiresCapabilities('project.create', …)`; the guard
 * resolves the caller's effective capability set and requires ALL of them.
 *
 *   - user principal: effective = ROLE_CAPABILITIES[membership.role] ∪
 *     custom-role grants (loaded live — a revoked grant dies on next request).
 *   - apikey principal: api_keys.scopes ARE the capability set (1:1 with the
 *     shared permissions catalog).
 *
 * Missing capabilities → FORBIDDEN with meta.missing (no oracle: capabilities
 * are not secrets, resource existence still goes through tenant scoping).
 */
import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS,
  resolveEffectivePermissions,
  type Permission,
} from '@aca/shared';
import type { DbClient } from '@aca/database';
import { apiErrors } from '../errors/api-error.js';
import { requestContext } from '../context/request-context.js';
import { PRISMA } from '../prisma.provider.js';

export const REQUIRED_CAPABILITIES_KEY = 'aca:required-capabilities';
export const RequiresCapabilities = (...capabilities: Permission[]) =>
  SetMetadata(REQUIRED_CAPABILITIES_KEY, capabilities);

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

/** Pure capability decision over an effective set (unit-tested directly). */
export function decideCapabilities(
  effective: ReadonlySet<string>,
  required: readonly Permission[],
): void {
  const missing = required.filter((p) => {
    if (!PERMISSION_SET.has(p)) return true; // unknown capability strings never grant
    return !effective.has(p);
  });
  if (missing.length > 0) {
    throw apiErrors.forbiddenWithMeta('missing required capabilities', { missing });
  }
}

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PRISMA) private readonly prisma: DbClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_CAPABILITIES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required === undefined || required.length === 0) return true;

    const ctx = requestContext();
    const principal = ctx.principal;
    if (principal === null) throw apiErrors.unauthenticated();

    if (principal.kind === 'apikey') {
      decideCapabilities(new Set(principal.scopes), required);
      return true;
    }

    const membership = ctx.membership;
    if (membership === null) {
      // capability route without tenant scope → cannot resolve effective permissions
      throw apiErrors.forbidden('capability check requires a tenant-scoped route');
    }

    let customPermissions: readonly Permission[] = [];
    if (membership.customRoleId !== null) {
      const customRole = await this.prisma.customRole.findUnique({
        where: { id: membership.customRoleId },
        select: { orgId: true, permissions: true },
      });
      if (customRole !== null && customRole.orgId === ctx.organizationId) {
        customPermissions = customRole.permissions.filter((p: string): p is Permission => PERMISSION_SET.has(p));
      }
    }

    const effective = resolveEffectivePermissions(membership.role, customPermissions);
    decideCapabilities(effective, required);
    return true;
  }
}
