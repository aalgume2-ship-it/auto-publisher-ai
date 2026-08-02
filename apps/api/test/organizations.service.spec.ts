/**
 * Unit tests for OrganizationsService. The DB is a hand-rolled fake exposing
 * exactly the delegates the service touches (structural typing); audit and
 * outbox are the REAL services (their effects land in the same fake tx, so
 * every test also proves: audit row written + event payload passes the frozen
 * catalog validation).
 */
import { describe, expect, it, vi } from 'vitest';
import { createOutboxWriter } from '@aca/events';
import { OrganizationsService } from '../src/modules/organizations/organizations.service.js';
import { AuditService } from '../src/common/audit/audit.service.js';
import { DomainOperations } from '../src/common/telemetry/domain-operations.js';
import { HttpMetrics } from '../src/common/telemetry/http-metrics.js';
import { ApiError } from '../src/common/errors/api-error.js';

const ORG_ID = '01924d3a-7c2f-7b8e-9f1a-2c3d4e5f6a7b';
const USER_ID = '01924d3a-7c2f-7f3e-8e2b-1c2d3e4f5a6c';

function orgRow(patch: Record<string, unknown> = {}) {
  return {
    id: ORG_ID,
    name: 'Noor Media Holding',
    slug: 'noor-media-holding',
    status: 'ACTIVE',
    timezone: 'UTC',
    defaultLocale: 'en',
    securityPolicy: {},
    createdAt: new Date('2026-08-02T09:30:00.000Z'),
    updatedAt: new Date('2026-08-02T09:30:00.000Z'),
    ...patch,
  };
}

interface FakeTx {
  organization: Record<string, ReturnType<typeof vi.fn>>;
  organizationMember: Record<string, ReturnType<typeof vi.fn>>;
  auditLog: { create: ReturnType<typeof vi.fn> };
  outboxEvent: { createMany: ReturnType<typeof vi.fn> };
  $transaction: (cb: (tx: FakeTx) => Promise<unknown>) => Promise<unknown>;
}

function makeFake(overrides: Partial<Record<'organization' | 'organizationMember', Record<string, unknown>>> = {}) {
  const tx: FakeTx = {
    organization: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      ...(overrides.organization ?? {}),
    } as FakeTx['organization'],
    organizationMember: { create: vi.fn().mockResolvedValue({}), ...(overrides.organizationMember ?? {}) } as FakeTx['organizationMember'],
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    outboxEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: async (cb) => cb(tx),
  };
  return tx;
}

function makeService(tx: FakeTx) {
  const db = { $transaction: (cb: (t: FakeTx) => Promise<unknown>) => cb(tx) };
  const tenantFactory = () => tx; // identity seam: fake already acts tenant-scoped
  const service = new OrganizationsService(
    db as never,
    tenantFactory as never,
    createOutboxWriter('apps/api'),
    new AuditService(),
    new DomainOperations(new HttpMetrics()),
  );
  return service;
}

function p2002(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

describe('OrganizationsService.createOrganization', () => {
  it('creates org + OWNER membership + audit + outbox event in one tx', async () => {
    const tx = makeFake();
    tx.organization.create.mockResolvedValue(orgRow());
    const svc = makeService(tx);
    const dto = await svc.createOrganization({ kind: 'user', userId: USER_ID }, { name: 'Noor Media Holding' });
    expect(dto.slug).toBe('noor-media-holding');
    expect(tx.organization.create).toHaveBeenCalledTimes(1);
    const memberData = tx.organizationMember.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(memberData.data).toMatchObject({ orgId: ORG_ID, userId: USER_ID, role: 'OWNER', status: 'ACTIVE' });
    const auditData = tx.auditLog.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(auditData.data['action']).toBe('organization.created');
    const events = tx.outboxEvent.createMany.mock.calls[0]?.[0] as { data: Array<Record<string, unknown>> };
    expect(events.data[0]?.['type']).toBe('aca.organization.created');
    expect((events.data[0]?.['payload'] as { payload: unknown }).payload).toMatchObject({
      orgId: ORG_ID,
      slug: 'noor-media-holding',
      ownerId: USER_ID,
    });
  });

  it('rejects API-key principals (never mint tenants) before touching the DB', async () => {
    const tx = makeFake();
    const svc = makeService(tx);
    await expect(svc.createOrganization({ kind: 'apikey', userId: null }, { name: 'X' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(tx.organization.create).not.toHaveBeenCalled();
  });

  it('explicit slug collision -> CONFLICT without retry', async () => {
    const tx = makeFake();
    tx.organization.create.mockRejectedValue(p2002());
    const svc = makeService(tx);
    await expect(
      svc.createOrganization({ kind: 'user', userId: USER_ID }, { name: 'N', slug: 'taken-slug' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(tx.organization.create).toHaveBeenCalledTimes(1);
  });

  it('auto-derived slug retries with numeric suffix on collision', async () => {
    const tx = makeFake();
    tx.organization.create.mockRejectedValueOnce(p2002()).mockResolvedValueOnce(orgRow({ slug: 'noor-media-holding-2' }));
    const svc = makeService(tx);
    const dto = await svc.createOrganization({ kind: 'user', userId: USER_ID }, { name: 'Noor Media Holding' });
    expect(dto.slug).toBe('noor-media-holding-2');
    expect(tx.organization.create).toHaveBeenCalledTimes(2);
  });
});

describe('OrganizationsService.getOrganization', () => {
  it('returns detail with counts', async () => {
    const tx = makeFake();
    tx.organization.findFirst.mockResolvedValue({ ...orgRow(), _count: { members: 4, teams: 2, departments: 1 } });
    const svc = makeService(tx);
    const dto = await svc.getOrganization(ORG_ID);
    expect(dto.counts).toEqual({ members: 4, teams: 2, departments: 1 });
  });

  it('NOT_FOUND when absent', async () => {
    const tx = makeFake();
    tx.organization.findFirst.mockResolvedValue(null);
    const svc = makeService(tx);
    await expect(svc.getOrganization(ORG_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('OrganizationsService.updateOrganization', () => {
  it('updates allowed fields, records audit + emits changed keys', async () => {
    const tx = makeFake();
    tx.organization.update.mockResolvedValue(orgRow({ name: 'Noor Media Group' }));
    const svc = makeService(tx);
    const dto = await svc.updateOrganization(ORG_ID, { name: 'Noor Media Group' });
    expect(dto.name).toBe('Noor Media Group');
    expect(tx.organization.update).toHaveBeenCalledWith({ where: { id: ORG_ID }, data: { name: 'Noor Media Group' } });
    const events = tx.outboxEvent.createMany.mock.calls[0]?.[0] as { data: Array<Record<string, unknown>> };
    expect(events.data[0]?.['type']).toBe('aca.organization.updated');
    expect((events.data[0]?.['payload'] as { payload: unknown }).payload).toMatchObject({ orgId: ORG_ID, changed: ['name'] });
  });
});

describe('OrganizationsService settings', () => {
  it('getSettings merges stored policy over defaults', async () => {
    const tx = makeFake();
    tx.organization.findFirst.mockResolvedValue({
      timezone: 'Asia/Riyadh',
      defaultLocale: 'ar-SA',
      securityPolicy: { enforceMfa: true, unknownGarbage: 'dropped' },
    });
    const svc = makeService(tx);
    const settings = await svc.getSettings(ORG_ID);
    expect(settings.timezone).toBe('Asia/Riyadh');
    expect(settings.securityPolicy).toMatchObject({ enforceMfa: true, enforceSso: false, sessionMaxHours: 24 });
    expect('unknownGarbage' in settings.securityPolicy).toBe(false);
  });

  it('updateSecurityPolicy whitelist-merges, emits the section event, and returns the FRESH re-read', async () => {
    const tx = makeFake();
    tx.organization.findFirst
      .mockResolvedValueOnce({ securityPolicy: { enforceMfa: true, junk: 1 } }) // pre-read for the merge
      .mockResolvedValueOnce({
        // post-update re-read THROUGH THE TX (pool read would be pre-commit stale)
        timezone: 'Asia/Riyadh',
        defaultLocale: 'ar-SA',
        securityPolicy: { enforceSso: true, enforceMfa: true, sessionMaxHours: 12, ipAllowListEnabled: false },
      });
    tx.organization.update.mockResolvedValue(orgRow());
    const svc = makeService(tx);
    const dto = await svc.updateSecurityPolicy(ORG_ID, { enforceSso: true, sessionMaxHours: 12 });
    const updateArgs = tx.organization.update.mock.calls[0]?.[0] as { data: { securityPolicy: Record<string, unknown> } };
    expect(updateArgs.data.securityPolicy).toEqual({
      enforceSso: true,
      enforceMfa: true,
      sessionMaxHours: 12,
      ipAllowListEnabled: false,
    });
    expect(dto.securityPolicy).toEqual({
      enforceSso: true,
      enforceMfa: true,
      sessionMaxHours: 12,
      ipAllowListEnabled: false,
    });
    expect(dto.timezone).toBe('Asia/Riyadh');
    expect(tx.organization.findFirst).toHaveBeenCalledTimes(2); // merge-read + fresh re-read
    const events = tx.outboxEvent.createMany.mock.calls[0]?.[0] as { data: Array<Record<string, unknown>> };
    expect((events.data[0]?.['payload'] as { payload: unknown }).payload).toMatchObject({
      section: 'security_policy',
      changed: ['enforceSso', 'sessionMaxHours'],
    });
    const auditData = tx.auditLog.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(auditData.data['action']).toBe('organization.security_policy_updated');
  });

  it('updateSettings writes changed keys only and answers with the fresh row (tx re-read)', async () => {
    const tx = makeFake();
    tx.organization.findFirst.mockResolvedValue({
      timezone: 'Asia/Riyadh',
      defaultLocale: 'ar-SA',
      securityPolicy: null,
    });
    tx.organization.update.mockResolvedValue(orgRow());
    const svc = makeService(tx);
    const dto = await svc.updateSettings(ORG_ID, { timezone: 'Asia/Riyadh' });
    const updateArgs = tx.organization.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(updateArgs.data).toEqual({ timezone: 'Asia/Riyadh' }); // defaultLocale untouched
    expect(dto.timezone).toBe('Asia/Riyadh'); // from the post-update read, not the request
    expect(dto.securityPolicy).toMatchObject({ enforceSso: false, sessionMaxHours: 24 }); // defaults over null
    const events = tx.outboxEvent.createMany.mock.calls[0]?.[0] as { data: Array<Record<string, unknown>> };
    expect((events.data[0]?.['payload'] as { payload: unknown }).payload).toMatchObject({
      section: 'general',
      changed: ['timezone'],
    });
  });

  it('errors surface unchanged through measure() (ApiError identity)', async () => {
    const tx = makeFake();
    tx.organization.findFirst.mockResolvedValue(null);
    const svc = makeService(tx);
    await expect(svc.getSettings(ORG_ID)).rejects.toBeInstanceOf(ApiError);
  });
});
