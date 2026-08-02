/**
 * Unit tests for DomainsService (fake tx + REAL AuditService/OutboxWriter,
 * injected DnsVerifier port — hermetic DNS).
 */
import { describe, expect, it, vi } from 'vitest';
import { createOutboxWriter } from '@aca/events';
import { DomainsService, buildInstructions, type DnsVerifier } from '../src/modules/organizations/domains.service.js';
import { AuditService } from '../src/common/audit/audit.service.js';
import { DomainOperations } from '../src/common/telemetry/domain-operations.js';
import { HttpMetrics } from '../src/common/telemetry/http-metrics.js';

const ORG_ID = '01924d3a-7c2f-7b8e-9f1a-2c3d4e5f6a7b';
const DOMAIN_ID = '01924d3a-2b3c-7d4e-9f5a-6b7c8d9e0f1a';

function domainRow(patch: Record<string, unknown> = {}) {
  return {
    id: DOMAIN_ID,
    orgId: ORG_ID,
    domain: 'portal.noor.example',
    type: 'PORTAL',
    status: 'PENDING_DNS',
    verificationToken: 'aca-verify=testtoken123',
    dkimSelectors: null,
    lastCheckedAt: null,
    activatedAt: null,
    createdAt: new Date('2026-08-02T09:30:00.000Z'),
    ...patch,
  };
}

type Fn = ReturnType<typeof vi.fn>;
function makeFake(delegates: Record<string, Record<string, Fn>> = {}) {
  const base: Record<string, Record<string, Fn>> = {
    customDomain: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    outboxEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    ...delegates,
  };
  const tx = { ...base, $transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx) };
  return tx as unknown as Record<string, Record<string, Fn>>;
}

function makeService(tx: unknown, dns: DnsVerifier) {
  const tenantFactory = () => tx;
  return new DomainsService(
    { $transaction: (cb: (t: unknown) => Promise<unknown>) => cb(tx) } as never,
    tenantFactory as never,
    createOutboxWriter('apps/api'),
    dns,
    new AuditService(),
    new DomainOperations(new HttpMetrics()),
  );
}

function outboxRows(tx: Record<string, Record<string, Fn>>): Array<Record<string, unknown>> {
  return (tx['outboxEvent']?.['createMany']?.mock.calls ?? []).flatMap(
    (c) => (c[0] as { data: Array<Record<string, unknown>> }).data,
  );
}

function p2002(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

function dnsWith(records: string[]): DnsVerifier & { resolveTxtRecord: Fn } {
  return { resolveTxtRecord: vi.fn().mockResolvedValue(records) };
}

describe('buildInstructions', () => {
  it('PORTAL instructions include the CNAME line; EMAIL_FROM does not', () => {
    const portal = buildInstructions('portal.noor.example', 'PORTAL', 'aca-verify=abc');
    expect(portal.some((l) => l.startsWith('Create DNS TXT record: _aca-challenge.portal.noor.example = aca-verify=abc'))).toBe(true);
    expect(portal.some((l) => l.includes('CNAME'))).toBe(true);
    const email = buildInstructions('mail.noor.example', 'EMAIL_FROM', 'aca-verify=abc');
    expect(email.some((l) => l.includes('CNAME'))).toBe(false);
  });
});

describe('DomainsService.registerDomain', () => {
  it('creates with a generated challenge token and emits aca.domain.registered', async () => {
    const tx = makeFake();
    tx['customDomain']?.['create']?.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve(domainRow({ ...args.data } as Record<string, unknown>)),
    );
    const svc = makeService(tx, dnsWith([]));
    const dto = await svc.registerDomain(ORG_ID, { domain: 'portal.noor.example', type: 'PORTAL' });
    expect(dto.verificationToken).toMatch(/^aca-verify=[0-9a-f]{48}$/);
    expect(dto.instructions.some((l) => l.includes('_aca-challenge.portal.noor.example'))).toBe(true);
    const rows = outboxRows(tx);
    expect(rows[0]?.['type']).toBe('aca.domain.registered');
  });

  it('duplicate domain (global unique) -> CONFLICT', async () => {
    const tx = makeFake();
    tx['customDomain']?.['create']?.mockRejectedValue(p2002());
    const svc = makeService(tx, dnsWith([]));
    await expect(svc.registerDomain(ORG_ID, { domain: 'taken.example', type: 'PORTAL' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('DomainsService.verifyDomain', () => {
  it('already ACTIVE -> returns early, DNS is never queried', async () => {
    const tx = makeFake();
    tx['customDomain']?.['findFirst']?.mockResolvedValue(domainRow({ status: 'ACTIVE' }));
    const dns = dnsWith([]);
    const svc = makeService(tx, dns);
    const dto = await svc.verifyDomain(ORG_ID, DOMAIN_ID);
    expect(dto.status).toBe('ACTIVE');
    expect(dns.resolveTxtRecord).not.toHaveBeenCalled();
  });

  it('TXT match -> ACTIVE + activatedAt + aca.domain.verified', async () => {
    const tx = makeFake();
    tx['customDomain']?.['findFirst']?.mockResolvedValue(domainRow());
    tx['customDomain']?.['update']?.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve(domainRow({ ...args.data } as Record<string, unknown>)),
    );
    const dns = dnsWith(['aca-verify=testtoken123']);
    const svc = makeService(tx, dns);
    const dto = await svc.verifyDomain(ORG_ID, DOMAIN_ID);
    expect(dns.resolveTxtRecord).toHaveBeenCalledWith('_aca-challenge.portal.noor.example');
    expect(dto.status).toBe('ACTIVE');
    expect(dto.activatedAt).not.toBeNull();
    const rows = outboxRows(tx);
    expect(rows[0]?.['type']).toBe('aca.domain.verified');
  });

  it('TXT mismatch -> FAILED persisted + verification_failed event + DOMAIN_VERIFICATION_FAILED(409) with meta', async () => {
    const tx = makeFake();
    tx['customDomain']?.['findFirst']?.mockResolvedValue(domainRow());
    const dns = dnsWith(['some-other-token']);
    const svc = makeService(tx, dns);
    let caught: unknown;
    try {
      await svc.verifyDomain(ORG_ID, DOMAIN_ID);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({
      code: 'DOMAIN_VERIFICATION_FAILED',
      meta: { host: '_aca-challenge.portal.noor.example', expected: 'aca-verify=testtoken123' },
    });
    const updateArgs = tx['customDomain']?.['update']?.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(updateArgs.data['status']).toBe('FAILED');
    expect(updateArgs.data['lastCheckedAt']).toBeInstanceOf(Date);
    const rows = outboxRows(tx);
    expect(rows[0]?.['type']).toBe('aca.domain.verification_failed');
  });

  it('domain outside org -> NOT_FOUND, DNS never queried', async () => {
    const tx = makeFake();
    tx['customDomain']?.['findFirst']?.mockResolvedValue(null);
    const dns = dnsWith([]);
    const svc = makeService(tx, dns);
    await expect(svc.verifyDomain(ORG_ID, DOMAIN_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(dns.resolveTxtRecord).not.toHaveBeenCalled();
  });
});

describe('DomainsService.deleteDomain', () => {
  it('deletes and emits aca.domain.deleted with the detached domain in payload', async () => {
    const tx = makeFake();
    tx['customDomain']?.['findFirst']?.mockResolvedValue(domainRow({ status: 'ACTIVE' }));
    tx['customDomain']?.['delete']?.mockResolvedValue(domainRow());
    const svc = makeService(tx, dnsWith([]));
    const result = await svc.deleteDomain(ORG_ID, DOMAIN_ID);
    expect(result).toEqual({ deleted: true });
    const rows = outboxRows(tx);
    expect((rows[0]?.['payload'] as { payload: unknown }).payload).toMatchObject({ domain: 'portal.noor.example', type: 'PORTAL' });
  });

  it('missing domain -> NOT_FOUND, zero writes', async () => {
    const tx = makeFake();
    tx['customDomain']?.['findFirst']?.mockResolvedValue(null);
    const svc = makeService(tx, dnsWith([]));
    await expect(svc.deleteDomain(ORG_ID, DOMAIN_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(tx['customDomain']?.['delete']).not.toHaveBeenCalled();
  });
});
