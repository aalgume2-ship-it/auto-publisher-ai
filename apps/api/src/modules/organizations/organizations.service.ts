/**
 * OrganizationsService — organization entity + settings business logic.
 * Controllers only pass (context-derived caller, validated body). Every
 * mutation: single transaction = domain write + audit row + outbox event
 * (ADR-024/027d). Every read of org data goes through the tenant-scoped
 * client (TENANT_CLIENT factory) — cross-org access is structurally blocked.
 */
import { Inject, Injectable } from '@nestjs/common';
import { generateId, type DbClient, type Prisma } from '@aca/database';
import { isUniqueViolation, type OutboxWriter } from '@aca/events';
import { apiErrors } from '../../common/errors/api-error.js';
import { PRISMA, TENANT_CLIENT, type TenantClientFactory } from '../../common/prisma.provider.js';
import { OUTBOX_WRITER } from '../../common/events/outbox.provider.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { DomainOperations } from '../../common/telemetry/domain-operations.js';
import {
  slugify,
  type CreateOrganizationBody,
  type SecurityPolicyBody,
  type UpdateOrganizationBody,
  type UpdateSettingsBody,
} from './organizations.dto.js';

const MODULE = 'organizations';
const SLUG_ATTEMPTS = 4;

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  defaultLocale: string;
  securityPolicy: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface OrganizationCounts {
  members: number;
  teams: number;
  departments: number;
}

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  defaultLocale: string;
  createdAt: Date;
  updatedAt: Date;
  counts?: OrganizationCounts;
}

export interface SettingsDto {
  timezone: string;
  defaultLocale: string;
  securityPolicy: Record<string, unknown>;
}

export const SECURITY_POLICY_DEFAULTS: Readonly<Record<string, unknown>> = {
  enforceSso: false,
  enforceMfa: false,
  sessionMaxHours: 24,
  ipAllowListEnabled: false,
};

export function toOrganizationDto(row: OrganizationRow, counts?: OrganizationCounts): OrganizationDto {
  const dto: OrganizationDto = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    timezone: row.timezone,
    defaultLocale: row.defaultLocale,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (counts !== undefined) dto.counts = counts;
  return dto;
}

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(PRISMA) private readonly db: DbClient,
    @Inject(TENANT_CLIENT) private readonly tenant: TenantClientFactory,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    private readonly audit: AuditService,
    private readonly ops: DomainOperations,
  ) {}

  /**
   * Creates an organization + OWNER membership for the caller. Authorization:
   * user principals only (API keys are pinned to a single existing org — an
   * api key must never mint new tenants). System client is correct here: org
   * creation is org-less by nature (ADR-025 guard-layer rule).
   */
  async createOrganization(caller: { kind: 'user' | 'apikey'; userId: string | null }, body: CreateOrganizationBody): Promise<OrganizationDto> {
    return this.ops.measure(MODULE, 'organization.create', async () => {
      if (caller.kind !== 'user' || caller.userId === null) {
        throw apiErrors.forbidden('only an authenticated user can create an organization');
      }
      const base = body.slug ?? slugify(body.name);
      for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
        const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
        try {
          return await this.db.$transaction(async (tx: Prisma.TransactionClient) => {
            const org = await tx.organization.create({
              data: {
                id: generateId(),
                name: body.name,
                slug,
                ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
                ...(body.defaultLocale !== undefined ? { defaultLocale: body.defaultLocale } : {}),
              },
            });
            await tx.organizationMember.create({
              data: { id: generateId(), orgId: org.id, userId: caller.userId!, role: 'OWNER', status: 'ACTIVE' },
            });
            await this.audit.record(tx, {
              orgId: org.id,
              action: 'organization.created',
              entityType: 'Organization',
              entityId: org.id,
              metadata: { name: org.name, slug: org.slug },
            });
            await this.outbox.write(tx, [
              {
                type: 'aca.organization.created',
                orgId: org.id,
                aggregateType: 'Organization',
                aggregateId: org.id,
                payload: { orgId: org.id, name: org.name, slug: org.slug, ownerId: caller.userId! },
              },
            ]);
            return toOrganizationDto(org);
          });
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          if (body.slug !== undefined) throw apiErrors.conflict(`slug "${base}" is already taken`);
          if (attempt === SLUG_ATTEMPTS - 1) throw apiErrors.conflict('could not allocate a unique organization slug');
        }
      }
      throw apiErrors.internal(); // unreachable — loop either returns or throws
    });
  }

  /** Tenant-scoped detail with member/team/department counts. */
  async getOrganization(orgId: string): Promise<OrganizationDto> {
    return this.ops.measure(MODULE, 'organization.get', async () => {
      const org = await this.tenant(this.db, orgId).organization.findFirst({
        where: { id: orgId },
        include: { _count: { select: { members: true, teams: true, departments: true } } },
      });
      if (org === null) throw apiErrors.notFound('Organization');
      const { _count, ...row } = org;
      return toOrganizationDto(row, _count);
    });
  }

  async updateOrganization(orgId: string, body: UpdateOrganizationBody): Promise<OrganizationDto> {
    return this.ops.measure(MODULE, 'organization.update', async () => {
      const changed = (Object.keys(body) as Array<keyof UpdateOrganizationBody>).filter((k) => body[k] !== undefined);
      return this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
        const org = await tx.organization.update({
          where: { id: orgId },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
            ...(body.defaultLocale !== undefined ? { defaultLocale: body.defaultLocale } : {}),
          },
        });
        await this.audit.record(tx, {
          orgId,
          action: 'organization.updated',
          entityType: 'Organization',
          entityId: orgId,
          metadata: { changed },
        });
        await this.outbox.write(tx, [
          {
            type: 'aca.organization.updated',
            orgId,
            aggregateType: 'Organization',
            aggregateId: orgId,
            payload: { orgId, changed },
          },
        ]);
        return toOrganizationDto(org);
      });
    });
  }

  async getSettings(orgId: string): Promise<SettingsDto> {
    return this.ops.measure(MODULE, 'organization.settings.get', async () => {
      const org = await this.tenant(this.db, orgId).organization.findFirst({
        where: { id: orgId },
        select: { timezone: true, defaultLocale: true, securityPolicy: true },
      });
      if (org === null) throw apiErrors.notFound('Organization');
      return {
        timezone: org.timezone,
        defaultLocale: org.defaultLocale,
        // whitelist-merge: the settings surface exposes exactly the known keys
        securityPolicy: { ...SECURITY_POLICY_DEFAULTS, ...(isPlainObject(org.securityPolicy) ? pickKnown(org.securityPolicy) : {}) },
      };
    });
  }

  async updateSettings(orgId: string, body: UpdateSettingsBody): Promise<SettingsDto> {
    return this.ops.measure(MODULE, 'organization.settings.update', async () => {
      const changed = (Object.keys(body) as Array<keyof UpdateSettingsBody>).filter((k) => body[k] !== undefined);
      return this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.organization.update({
          where: { id: orgId },
          data: {
            ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
            ...(body.defaultLocale !== undefined ? { defaultLocale: body.defaultLocale } : {}),
          },
        });
        await this.audit.record(tx, {
          orgId,
          action: 'organization.settings_updated',
          entityType: 'Organization',
          entityId: orgId,
          metadata: { section: 'general', changed },
        });
        await this.outbox.write(tx, [
          {
            type: 'aca.organization.settings_updated',
            orgId,
            aggregateType: 'Organization',
            aggregateId: orgId,
            payload: { orgId, section: 'general', changed },
          },
        ]);
        return this.getSettings(orgId);
      });
    });
  }

  /**
   * Security policy is a whitelist-merge: unknown existing keys are dropped,
   * untouched known keys are kept, then the whole object is rewritten.
   * OWNER-only at the route (security.policy.manage).
   */
  async updateSecurityPolicy(orgId: string, body: SecurityPolicyBody): Promise<SettingsDto> {
    return this.ops.measure(MODULE, 'organization.security_policy.update', async () => {
      const changed = (Object.keys(body) as Array<keyof SecurityPolicyBody>).filter((k) => body[k] !== undefined);
      return this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
        const current = await tx.organization.findFirst({ where: { id: orgId }, select: { securityPolicy: true } });
        if (current === null) throw apiErrors.notFound('Organization');
        const next = {
          ...SECURITY_POLICY_DEFAULTS,
          ...(isPlainObject(current.securityPolicy) ? pickKnown(current.securityPolicy) : {}),
          ...body,
        };
        await tx.organization.update({ where: { id: orgId }, data: { securityPolicy: next } });
        await this.audit.record(tx, {
          orgId,
          action: 'organization.security_policy_updated',
          entityType: 'Organization',
          entityId: orgId,
          metadata: { section: 'security_policy', changed },
        });
        await this.outbox.write(tx, [
          {
            type: 'aca.organization.settings_updated',
            orgId,
            aggregateType: 'Organization',
            aggregateId: orgId,
            payload: { orgId, section: 'security_policy', changed },
          },
        ]);
        return this.getSettings(orgId);
      });
    });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickKnown(policy: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(SECURITY_POLICY_DEFAULTS)) {
    if (policy[key] !== undefined) out[key] = policy[key];
  }
  return out;
}
