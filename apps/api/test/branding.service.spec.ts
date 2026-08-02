/**
 * Unit tests for BrandingService (fake tx + REAL AuditService/OutboxWriter).
 */
import { describe, expect, it, vi } from 'vitest';
import { createOutboxWriter } from '@aca/events';
import { BrandingService, BRAND_DEFAULTS } from '../src/modules/organizations/branding.service.js';
import { AuditService } from '../src/common/audit/audit.service.js';
import { DomainOperations } from '../src/common/telemetry/domain-operations.js';
import { HttpMetrics } from '../src/common/telemetry/http-metrics.js';

const ORG_ID = '01924d3a-7c2f-7b8e-9f1a-2c3d4e5f6a7b';
const BRAND_ID = '01924d3a-1a2b-7c3d-8e4f-5a6b7c8d9e0f';
const ASSET_ID = '01924d3a-3c4d-7e5f-8a6b-7c8d9e0f1a2b';

function fullFeatures(overrides: Record<string, unknown> = {}) {
  return {
    trialDays: 14,
    watermark: false,
    autopilot: true,
    reviewModes: ['FULL_AUTO'],
    platforms: ['youtube'],
    apiAccess: true,
    byok: true,
    thumbnailAb: true,
    optimizerAutoApply: true,
    priorityQueue: true,
    regionPinning: true,
    whiteLabel: false,
    sso: true,
    auditRetentionDays: 365,
    auditExportApi: true,
    supportTier: 'priority',
    ...overrides,
  };
}

function brandRow(patch: Record<string, unknown> = {}) {
  return {
    id: BRAND_ID,
    orgId: ORG_ID,
    brandName: 'Noor Podcasts',
    logoAssetId: null,
    logoDarkAssetId: null,
    faviconAssetId: null,
    primaryColor: '#1a7a4a',
    theme: { 'color-scheme': 'dark' },
    emailFromName: 'Noor Media',
    emailTemplatePack: 'default',
    supportUrl: null,
    termsUrl: null,
    privacyUrl: null,
    hidePoweredBy: false,
    createdAt: new Date('2026-08-02T09:30:00.000Z'),
    updatedAt: new Date('2026-08-02T09:30:00.000Z'),
    ...patch,
  };
}

type Fn = ReturnType<typeof vi.fn>;
function makeFake(delegates: Record<string, Record<string, Fn>> = {}) {
  const base: Record<string, Record<string, Fn>> = {
    organizationBrand: { findFirst: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    subscription: { findFirst: vi.fn() },
    asset: { findFirst: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    outboxEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    ...delegates,
  };
  const tx = { ...base, $transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx) };
  return tx as unknown as Record<string, Record<string, Fn>>;
}

function makeService(tx: unknown) {
  const tenantFactory = () => tx;
  return new BrandingService(
    { customDomain: { findFirst: vi.fn() } } as never,
    tenantFactory as never,
    createOutboxWriter('apps/api'),
    new AuditService(),
    new DomainOperations(new HttpMetrics()),
  );
}

function outboxRows(tx: Record<string, Record<string, Fn>>): Array<Record<string, unknown>> {
  return (tx['outboxEvent']?.['createMany']?.mock.calls ?? []).flatMap(
    (c) => (c[0] as { data: Array<Record<string, unknown>> }).data,
  );
}

describe('BrandingService.getBrand', () => {
  it('returns platform defaults when no row exists (never 404 for own org)', async () => {
    const tx = makeFake();
    tx['organizationBrand']?.['findFirst']?.mockResolvedValue(null);
    const svc = makeService(tx);
    const brand = await svc.getBrand(ORG_ID);
    expect(brand).toEqual(BRAND_DEFAULTS);
  });
});

describe('BrandingService.putBrand', () => {
  it('upserts with orgId on create, emits aca.brand.updated from the stored row', async () => {
    const tx = makeFake();
    tx['organizationBrand']?.['upsert']?.mockResolvedValue(brandRow());
    const svc = makeService(tx);
    const dto = await svc.putBrand(ORG_ID, { brandName: 'Noor Podcasts', primaryColor: '#1a7a4a' });
    expect(dto.primaryColor).toBe('#1a7a4a');
    const args = tx['organizationBrand']?.['upsert']?.mock.calls[0]?.[0] as {
      where: { orgId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(args.where.orgId).toBe(ORG_ID);
    expect(args.create['orgId']).toBe(ORG_ID);
    const rows = outboxRows(tx);
    expect(rows[0]?.['type']).toBe('aca.brand.updated');
    expect((rows[0]?.['payload'] as { payload: unknown }).payload).toMatchObject({
      changed: expect.arrayContaining(['brandName', 'primaryColor']),
      hidePoweredBy: false,
    });
  });

  it('hidePoweredBy=true without whiteLabel entitlement -> FLAG_LOCKED (fail-closed)', async () => {
    const tx = makeFake();
    tx['subscription']?.['findFirst']?.mockResolvedValue({ plan: { features: fullFeatures({ whiteLabel: false }) } });
    const svc = makeService(tx);
    await expect(svc.putBrand(ORG_ID, { hidePoweredBy: true })).rejects.toMatchObject({ code: 'FLAG_LOCKED' });
    expect(tx['organizationBrand']?.['upsert']).not.toHaveBeenCalled();
  });

  it('hidePoweredBy=true with NO subscription at all -> FLAG_LOCKED (fail-closed)', async () => {
    const tx = makeFake();
    tx['subscription']?.['findFirst']?.mockResolvedValue(null);
    const svc = makeService(tx);
    await expect(svc.putBrand(ORG_ID, { hidePoweredBy: true })).rejects.toMatchObject({ code: 'FLAG_LOCKED' });
  });

  it('hidePoweredBy=true allowed when plan carries whiteLabel', async () => {
    const tx = makeFake();
    tx['subscription']?.['findFirst']?.mockResolvedValue({ plan: { features: fullFeatures({ whiteLabel: true }) } });
    tx['organizationBrand']?.['upsert']?.mockResolvedValue(brandRow({ hidePoweredBy: true }));
    const svc = makeService(tx);
    const dto = await svc.putBrand(ORG_ID, { hidePoweredBy: true });
    expect(dto.hidePoweredBy).toBe(true);
  });

  it('logo asset outside the org -> NOT_FOUND Asset, no upsert', async () => {
    const tx = makeFake();
    tx['asset']?.['findFirst']?.mockResolvedValue(null);
    const svc = makeService(tx);
    await expect(svc.putBrand(ORG_ID, { logoAssetId: ASSET_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(tx['organizationBrand']?.['upsert']).not.toHaveBeenCalled();
  });
});

describe('BrandingService.resetBrand / resolveByHost', () => {
  it('reset deletes the row and emits aca.brand.reset', async () => {
    const tx = makeFake();
    tx['organizationBrand']?.['findFirst']?.mockResolvedValue({ id: BRAND_ID });
    tx['organizationBrand']?.['delete']?.mockResolvedValue(brandRow());
    const svc = makeService(tx);
    const dto = await svc.resetBrand(ORG_ID);
    expect(dto).toEqual(BRAND_DEFAULTS);
    expect(tx['organizationBrand']?.['delete']).toHaveBeenCalledWith({ where: { id: BRAND_ID } });
    const rows = outboxRows(tx);
    expect(rows[0]?.['type']).toBe('aca.brand.reset');
  });

  it('resolveByHost returns slug+brand+locale for ACTIVE PORTAL domains; defaults when org has no brand row', async () => {
    const tx = makeFake();
    const db = {
      customDomain: {
        findFirst: vi.fn().mockResolvedValue({
          organization: { slug: 'noor-media-holding', defaultLocale: 'ar-SA', brand: null },
        }),
      },
    };
    const tenantFactory = () => tx;
    const svc = new BrandingService(
      db as never,
      tenantFactory as never,
      createOutboxWriter('apps/api'),
      new AuditService(),
      new DomainOperations(new HttpMetrics()),
    );
    const resolved = await svc.resolveByHost('Portal.NOOR.example');
    expect(resolved.orgSlug).toBe('noor-media-holding');
    expect(resolved.brand).toEqual(BRAND_DEFAULTS);
    expect(resolved.localeDefault).toBe('ar-SA');
    const args = db.customDomain.findFirst.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ domain: 'portal.noor.example', type: 'PORTAL', status: 'ACTIVE' });
  });

  it('resolveByHost 404s when nothing matches', async () => {
    const db = { customDomain: { findFirst: vi.fn().mockResolvedValue(null) } };
    const svc = new BrandingService(
      db as never,
      (() => ({})) as never,
      createOutboxWriter('apps/api'),
      new AuditService(),
      new DomainOperations(new HttpMetrics()),
    );
    await expect(svc.resolveByHost('unknown.example')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
