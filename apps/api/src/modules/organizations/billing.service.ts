/**
 * OrgBillingService — billing profile (legal/tax) upsert + subscription read
 * (API.md §4.5, ADR-027). Audit metadata logs FIELD KEYS ONLY for billing
 * data — legal/tax PII values never land in audit rows, events, or logs.
 * Plan mutation/checkout lives with the billing provider module (out of
 * Module-1 scope by design; this surface is read-only + profile).
 */
import { Inject, Injectable } from '@nestjs/common';
import { generateId, type DbClient, type Prisma } from '@aca/database';
import type { OutboxWriter } from '@aca/events';
import { parsePlanFeatures, type PlanFeatures } from '@aca/shared';
import { apiErrors } from '../../common/errors/api-error.js';
import { PRISMA, TENANT_CLIENT, type TenantClientFactory } from '../../common/prisma.provider.js';
import { OUTBOX_WRITER } from '../../common/events/outbox.provider.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { DomainOperations } from '../../common/telemetry/domain-operations.js';
import type { BillingProfileBody } from './billing.dto.js';

const MODULE = 'organizations';

export interface BillingProfileDto {
  legalName: string | null;
  billingEmail: string | null;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
  purchaseOrderRef: string | null;
}

export const BILLING_PROFILE_EMPTY: Readonly<BillingProfileDto> = {
  legalName: null,
  billingEmail: null,
  taxId: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
  countryCode: null,
  purchaseOrderRef: null,
};

export interface SubscriptionDto {
  status: string;
  provider: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
  plan: {
    code: string;
    name: string;
    monthlyPriceCents: number;
    yearlyPriceCents: number;
    currency: string;
    aiCreditsMonthly: number;
    maxChannels: number;
    maxProjects: number;
    maxVideosPerMonth: number;
    maxTeamMembers: number;
    maxStorageGb: number;
    features: PlanFeatures | Record<string, never>;
  };
}

type ProfileRow = BillingProfileDto;

function toProfileDto(row: ProfileRow): BillingProfileDto {
  return {
    legalName: row.legalName,
    billingEmail: row.billingEmail,
    taxId: row.taxId,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    countryCode: row.countryCode,
    purchaseOrderRef: row.purchaseOrderRef,
  };
}

@Injectable()
export class OrgBillingService {
  constructor(
    @Inject(PRISMA) private readonly db: DbClient,
    @Inject(TENANT_CLIENT) private readonly tenant: TenantClientFactory,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    private readonly audit: AuditService,
    private readonly ops: DomainOperations,
  ) {}

  async getBillingProfile(orgId: string): Promise<BillingProfileDto> {
    return this.ops.measure(MODULE, 'billing_profile.get', async () => {
      const row = await this.tenant(this.db, orgId).organizationBillingProfile.findFirst({ where: { orgId } });
      return row === null ? { ...BILLING_PROFILE_EMPTY } : toProfileDto(row);
    });
  }

  /** Upsert. billingEmail is required when the profile is first created. */
  async putBillingProfile(orgId: string, body: BillingProfileBody): Promise<BillingProfileDto> {
    return this.ops.measure(MODULE, 'billing_profile.put', async () => {
      const changed = Object.keys(body).filter((k) => Object.prototype.hasOwnProperty.call(body, k));
      return this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
        const existing = await tx.organizationBillingProfile.findFirst({ where: { orgId }, select: { id: true } });
        if (existing === null && body.billingEmail === undefined) {
          throw apiErrors.validationFailed([{ path: 'billingEmail', code: 'invalid_type', message: 'billingEmail is required when creating the billing profile' }]);
        }
        const data = {
          ...(Object.prototype.hasOwnProperty.call(body, 'legalName') ? { legalName: body.legalName ?? null } : {}),
          ...(body.billingEmail !== undefined ? { billingEmail: body.billingEmail } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'taxId') ? { taxId: body.taxId ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'addressLine1') ? { addressLine1: body.addressLine1 ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'addressLine2') ? { addressLine2: body.addressLine2 ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'city') ? { city: body.city ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'state') ? { state: body.state ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'postalCode') ? { postalCode: body.postalCode ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'countryCode') ? { countryCode: body.countryCode ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'purchaseOrderRef') ? { purchaseOrderRef: body.purchaseOrderRef ?? null } : {}),
        };
        // Branch (not upsert): Prisma requires billingEmail on create, the
        // guard above proved it present, and the tenant extension pre-verifies
        // ownership on update-by-id.
        const row =
          existing === null
            ? await tx.organizationBillingProfile.create({
                data: { id: generateId(), orgId, ...data, billingEmail: body.billingEmail as string },
              })
            : await tx.organizationBillingProfile.update({ where: { id: existing.id }, data });
        // VALUES ARE NEVER LOGGED: keys only (tax/legal PII discipline)
        await this.audit.record(tx, {
          orgId,
          action: 'organization.billing_profile_updated',
          entityType: 'OrganizationBillingProfile',
          entityId: row.id,
          metadata: { changed },
        });
        await this.outbox.write(tx, [
          {
            type: 'aca.organization.billing_profile_updated',
            orgId,
            aggregateType: 'OrganizationBillingProfile',
            aggregateId: row.id,
            payload: { orgId, changed },
          },
        ]);
        return toProfileDto(row);
      });
    });
  }

  /** Subscription + embedded plan (features parsed fail-closed) + credit balance. */
  async getSubscription(orgId: string): Promise<{ subscription: SubscriptionDto; credits: { balance: number } }> {
    return this.ops.measure(MODULE, 'subscription.get', async () => {
      const tenantDb = this.tenant(this.db, orgId);
      const subscription = await tenantDb.subscription.findFirst({
        where: { orgId },
        include: { plan: true },
      });
      if (subscription === null) throw apiErrors.notFound('Subscription');
      const latestCredit = await tenantDb.aiCreditTransaction.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      });
      const plan = subscription.plan;
      return {
        subscription: {
          status: subscription.status,
          provider: subscription.provider,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          trialEndsAt: subscription.trialEndsAt,
          plan: {
            code: plan.code,
            name: plan.name,
            monthlyPriceCents: plan.monthlyPriceCents,
            yearlyPriceCents: plan.yearlyPriceCents,
            currency: plan.currency,
            aiCreditsMonthly: plan.aiCreditsMonthly,
            maxChannels: plan.maxChannels,
            maxProjects: plan.maxProjects,
            maxVideosPerMonth: plan.maxVideosPerMonth,
            maxTeamMembers: plan.maxTeamMembers,
            maxStorageGb: plan.maxStorageGb,
            features: parsePlanFeatures(plan.features) ?? {},
          },
        },
        credits: { balance: latestCredit?.balanceAfter ?? 0 },
      };
    });
  }
}
