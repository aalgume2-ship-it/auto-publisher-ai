/**
 * Unit tests for DepartmentsService (fake tx + REAL AuditService/OutboxWriter).
 */
import { describe, expect, it, vi } from 'vitest';
import { createOutboxWriter } from '@aca/events';
import { DepartmentsService } from '../src/modules/organizations/departments.service.js';
import { AuditService } from '../src/common/audit/audit.service.js';
import { DomainOperations } from '../src/common/telemetry/domain-operations.js';
import { HttpMetrics } from '../src/common/telemetry/http-metrics.js';

const ORG_ID = '01924d3a-7c2f-7b8e-9f1a-2c3d4e5f6a7b';
const DEPT_ID = '01924d3a-9c2d-7e8f-b4c3-5d6e7f8a9b0c';

function deptRow(patch: Record<string, unknown> = {}) {
  return {
    id: DEPT_ID,
    orgId: ORG_ID,
    name: 'Content Production',
    slug: 'content-production',
    description: null,
    createdAt: new Date('2026-08-02T09:30:00.000Z'),
    updatedAt: new Date('2026-08-02T09:30:00.000Z'),
    ...patch,
  };
}

type Fn = ReturnType<typeof vi.fn>;
function makeFake(delegates: Record<string, Record<string, Fn>> = {}) {
  const base: Record<string, Record<string, Fn>> = {
    department: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    team: { updateMany: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    outboxEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    ...delegates,
  };
  const tx = { ...base, $transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx) };
  return tx as unknown as Record<string, Record<string, Fn>>;
}

function makeService(tx: unknown) {
  const tenantFactory = () => tx;
  return new DepartmentsService(
    { $transaction: (cb: (t: unknown) => Promise<unknown>) => cb(tx) } as never,
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

function p2002(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

describe('DepartmentsService', () => {
  it('create: slug auto-derives, audit + aca.department.created event in one tx', async () => {
    const tx = makeFake();
    tx['department']?.['create']?.mockResolvedValue(deptRow());
    const svc = makeService(tx);
    const dto = await svc.createDepartment(ORG_ID, { name: 'Content Production' });
    expect(dto.slug).toBe('content-production');
    expect(dto.teamCount).toBe(0);
    const args = tx['department']?.['create']?.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(args.data).toMatchObject({ orgId: ORG_ID, slug: 'content-production' });
    const rows = outboxRows(tx);
    expect(rows[0]?.['type']).toBe('aca.department.created');
    expect((rows[0]?.['payload'] as { payload: unknown }).payload).toMatchObject({ departmentId: DEPT_ID, slug: 'content-production' });
  });

  it('create: slug collision -> CONFLICT', async () => {
    const tx = makeFake();
    tx['department']?.['create']?.mockRejectedValue(p2002());
    const svc = makeService(tx);
    await expect(svc.createDepartment(ORG_ID, { name: 'Dup', slug: 'taken' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('list: paginates with member counts and nextCursor', async () => {
    const tx = makeFake();
    tx['department']?.['findMany']?.mockResolvedValue([
      { ...deptRow({ id: 'a1' }), _count: { teams: 3 } },
      { ...deptRow({ id: 'b2' }), _count: { teams: 0 } },
    ]);
    const svc = makeService(tx);
    const page = await svc.listDepartments(ORG_ID, { limit: 1 });
    expect(page.data[0]?.teamCount).toBe(3);
    expect(page.nextCursor).toBe('a1');
  });

  it('get: includes teams, NOT_FOUND when invisible', async () => {
    const tx = makeFake();
    tx['department']?.['findFirst']?.mockResolvedValue({
      ...deptRow(),
      teams: [{ id: 't1', name: 'Shorts Squad' }],
      _count: { teams: 1 },
    });
    const svc = makeService(tx);
    const dto = await svc.getDepartment(ORG_ID, DEPT_ID);
    expect(dto.teams).toEqual([{ id: 't1', name: 'Shorts Squad' }]);

    tx['department']?.['findFirst']?.mockResolvedValue(null);
    await expect(svc.getDepartment(ORG_ID, DEPT_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('update: changed[] captures explicit keys incl. null description', async () => {
    const tx = makeFake();
    tx['department']?.['update']?.mockResolvedValue(deptRow({ description: null }));
    const svc = makeService(tx);
    await svc.updateDepartment(ORG_ID, DEPT_ID, { description: null, name: 'Content & Media' });
    const rows = outboxRows(tx);
    expect((rows[0]?.['payload'] as { payload: unknown }).payload).toMatchObject({ changed: expect.arrayContaining(['name', 'description']) });
  });

  it('delete: detaches teams first, then deletes, audits + events the count', async () => {
    const tx = makeFake();
    tx['department']?.['findFirst']?.mockResolvedValue({ id: DEPT_ID });
    tx['team']?.['updateMany']?.mockResolvedValue({ count: 4 });
    tx['department']?.['delete']?.mockResolvedValue(deptRow());
    const svc = makeService(tx);
    const result = await svc.deleteDepartment(ORG_ID, DEPT_ID);
    expect(result).toEqual({ deleted: true, teamsDetached: 4 });
    const detach = tx['team']?.['updateMany']?.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(detach.data).toEqual({ departmentId: null });
    const rows = outboxRows(tx);
    expect((rows[0]?.['payload'] as { payload: unknown }).payload).toMatchObject({ teamsDetached: 4 });
  });

  it('delete: missing row -> NOT_FOUND, zero destructive calls', async () => {
    const tx = makeFake();
    tx['department']?.['findFirst']?.mockResolvedValue(null);
    const svc = makeService(tx);
    await expect(svc.deleteDepartment(ORG_ID, DEPT_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(tx['team']?.['updateMany']).not.toHaveBeenCalled();
  });
});
