/**
 * Unit tests for OrgBillingService (fake tx + REAL AuditService/OutboxWriter).
 * Special attention: billing VALUES must never reach audit metadata — keys only.
 */
import { describe, expect, it, vi } from 'vitest';
import { createOutboxWriter } from '@aca/events';
import { OrgBillingService, BILLING_PROFILE_EMPTY } from '../src/modules/organizations/billing.service.js';
import { AuditService } from '../src/common/audit/audit.service.js';
import { DomainOperations } from '../src/common/telemetry/domain-operations.js';
import { HttpMetrics } from '../src/common/telemetry/http-metrics.js';

const ORG_ID = '01924d3a-7c2f-7b8e-9f1a-2c3d4e5f6a7b';
const PROFILE_ID = '01924d3a-4d5e-7f6a-9b7c-8d9e0f1a2b3c';

function profileRow(patch: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    orgId: ORG_ID,
    legalName: 'Noor Media Holding LLC',
    billingEmail: 'billing@noor.example',
    taxId: '310123456700003',
    addressLine1: 'King Fahd Rd 123',
    addressLine2: null,
    city: 'Riyadh',
    state: null,
    postalCode: '12214',
    countryCode: 'SA',
    purchaseOrderRef: null,
    createdAt: new Date('2026-08-02T09:30:00.000Z'),
    updatedAt: new Date('2026-08-02T09:30:00.000Z'),
    ...patch,
  };
}

type Fn = ReturnType<typeof vi.fn>;
function makeFake(delegates: Record<string, Record<string, Fn>> = {}) {
  const base: Record<string, Record<string, Fn>> = {
    organizationBillingProfile: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    subscription: { findFirst: vi.fn() },
    aiCreditTransaction: { findFirst: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    outboxEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    ...delegates,
  };
  const tx = { ...base, $transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx) };
  return tx as unknown as Record<string, Record<string, Fn>>;
}

function makeService(tx: unknown) {
  const tenantFactory = () => tx;
  return new OrgBillingService(
    { $transaction: (cb: (t: unknown) => Promise<unknown>) => cb(tx), plan: { findMany: vi.fn(), findUnique: vi.fn() }, organization: { update: vi.fn() } } as never,
    tenantFactory as never,
    createOutboxWriter('apps/api'),
    { billing: { provider: 'stripe', stripeSecretKey: 'sk_test_x', stripePublishableKey: 'pk_test_x' } } as never,
    new AuditService(),
    new DomainOperations(new HttpMetrics()),
  );
}

describe('OrgBillingService.getBillingProfile', () => {
  it('returns all-null fields when no profile exists', async () => {
    const tx = makeFake();
    tx['organizationBillingProfile']?.['findFirst']?.mockResolvedValue(null);
    const svc = makeService(tx);
    expect(await svc.getBillingProfile(ORG_ID)).toEqual(BILLING_PROFILE_EMPTY);
  });
});

describe('OrgBillingService.putBillingProfile', () => {
  it('create requires billingEmail even though the field is optional in the body', async () => {
    const tx = makeFake();
    tx['organizationBillingProfile']?.['findFirst']?.mockResolvedValue(null);
    const svc = makeService(tx);
    await expect(svc.putBillingProfile(ORG_ID, { legalName: 'X' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(tx['organizationBillingProfile']?.['create']).not.toHaveBeenCalled();
  });

  it('creates on first write and audits KEYS ONLY (no tax/legal values in metadata)', async () => {
    const tx = makeFake();
    tx['organizationBillingProfile']?.['findFirst']?.mockResolvedValue(null);
    tx['organizationBillingProfile']?.['create']?.mockResolvedValue(profileRow());
    const svc = makeService(tx);
    const dto = await svc.putBillingProfile(ORG_ID, {
      billingEmail: 'billing@noor.example',
      legalName: 'Noor Media Holding LLC',
      taxId: '310123456700003',
    });
    expect(dto.billingEmail).toBe('billing@noor.example');
    const audit = tx['auditLog']?.['create']?.mock.calls[0]?.[0] as { data: { metadata: Record<string, unknown> } };
    const metadata = JSON.stringify(audit.data.metadata);
    expect(metadata).toContain('billingEmail');
    expect(metadata).not.toContain('310123456700003'); // tax number must never be journaled
    expect(metadata).not.toContain('billing@noor.example'); // nor PII values
    const rows = (tx['outboxEvent']?.['createMany']?.mock.calls ?? []).flatMap(
      (c) => (c[0] as { data: Array<Record<string, unknown>> }).data,
    );
    expect(rows[0]?.['type']).toBe('aca.organization.billing_profile_updated');
    const eventPayload = JSON.stringify((rows[0]?.['payload'] as { payload: unknown }).payload);
    expect(eventPayload).toContain('changed');
    expect(eventPayload).not.toContain('310123456700003');
  });

  it('updates a slice when the profile exists (billingEmail stays optional)', async () => {
    const tx = makeFake();
    tx['organizationBillingProfile']?.['findFirst']?.mockResolvedValue({ id: PROFILE_ID });
    tx['organizationBillingProfile']?.['update']?.mockResolvedValue(profileRow({ city: 'Jeddah' }));
    const svc = makeService(tx);
    const dto = await svc.putBillingProfile(ORG_ID, { city: 'Jeddah' });
    expect(dto.city).toBe('Jeddah');
    const args = tx['organizationBillingProfile']?.['update']?.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(args.data)).toEqual(['city']);
  });
});

describe('OrgBillingService.getSubscription', () => {
  const planRow = {
    id: 'plan-1',
    code: 'pro',
    name: 'Pro',
    monthlyPriceCents: 4900,
    yearlyPriceCents: 47000,
    currency: 'USD',
    providerPriceRefs: {},
    aiCreditsMonthly: 5000,
    maxChannels: 10,
    maxProjects: 25,
    maxVideosPerMonth: 300,
    maxTeamMembers: 15,
    maxStorageGb: 500,
    features: { garbage: true }, // unparseable -> features {} fail-closed
    isPublic: true,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
  };

  it('returns subscription + plan + latest credit balance (0 when no ledger rows)', async () => {
    const tx = makeFake();
    tx['subscription']?.['findFirst']?.mockResolvedValue({
      status: 'TRIALING',
      provider: 'stripe',
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      trialEndsAt: new Date('2026-08-15T00:00:00.000Z'),
      plan: { ...planRow, features: { trialDays: 14, watermark: false, autopilot: true, reviewModes: ['FULL_AUTO'], platforms: ['youtube'], apiAccess: true, byok: true, thumbnailAb: true, optimizerAutoApply: true, priorityQueue: true, regionPinning: true, whiteLabel: true, sso: true, auditRetentionDays: 365, auditExportApi: true, supportTier: 'priority' } },
    });
    tx['aiCreditTransaction']?.['findFirst']?.mockResolvedValue(null);
    const svc = makeService(tx);
    const result = await svc.getSubscription(ORG_ID);
    expect(result.subscription.status).toBe('TRIALING');
    expect(result.subscription.plan.code).toBe('pro');
    expect(result.subscription.plan.features).toMatchObject({ whiteLabel: true });
    expect(result.credits.balance).toBe(0);
  });

  it('reads the most recent balanceAfter when ledger rows exist; unparseable features -> {} fail-closed', async () => {
    const tx = makeFake();
    tx['subscription']?.['findFirst']?.mockResolvedValue({
      status: 'ACTIVE',
      provider: 'stripe',
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
      plan: planRow,
    });
    tx['aiCreditTransaction']?.['findFirst']?.mockResolvedValue({ balanceAfter: 4820 });
    const svc = makeService(tx);
    const result = await svc.getSubscription(ORG_ID);
    expect(result.credits.balance).toBe(4820);
    expect(result.subscription.plan.features).toEqual({});
  });

  it('no subscription -> NOT_FOUND', async () => {
    const tx = makeFake();
    tx['subscription']?.['findFirst']?.mockResolvedValue(null);
    const svc = makeService(tx);
    await expect(svc.getSubscription(ORG_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
