/**
 * Unit tests for TeamsService (fake tx + REAL AuditService/OutboxWriter — see
 * organizations.service.spec.ts header for the pattern rationale).
 */
import { describe, expect, it, vi } from 'vitest';
import { createOutboxWriter } from '@aca/events';
import { TeamsService } from '../src/modules/organizations/teams.service.js';
import { AuditService } from '../src/common/audit/audit.service.js';
import { DomainOperations } from '../src/common/telemetry/domain-operations.js';
import { HttpMetrics } from '../src/common/telemetry/http-metrics.js';

const ORG_ID = '01924d3a-7c2f-7b8e-9f1a-2c3d4e5f6a7b';
const TEAM_ID = '01924d3a-8b1c-7d9f-a3b2-4c5d6e7f8a9b';
const DEPT_ID = '01924d3a-9c2d-7e8f-b4c3-5d6e7f8a9b0c';
const USER_ID = '01924d3a-7c2f-7f3e-8e2b-1c2d3e4f5a6c';

function teamRow(patch: Record<string, unknown> = {}) {
  return {
    id: TEAM_ID,
    orgId: ORG_ID,
    name: 'Shorts Squad',
    description: null,
    departmentId: null,
    createdAt: new Date('2026-08-02T09:30:00.000Z'),
    updatedAt: new Date('2026-08-02T09:30:00.000Z'),
    ...patch,
  };
}

type Fn = ReturnType<typeof vi.fn>;
interface FakeDelegates {
  [delegate: string]: Record<string, Fn>;
}

function makeFake(delegates: FakeDelegates) {
  const base: FakeDelegates = {
    department: { findFirst: vi.fn() },
    team: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    teamMember: { create: vi.fn(), deleteMany: vi.fn() },
    project: { updateMany: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    outboxEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    ...delegates,
  };
  const tx = {
    ...base,
    $transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx),
  };
  return tx as unknown as {
    [k: string]: Record<string, Fn> | ((cb: (t: unknown) => Promise<unknown>) => Promise<unknown>);
  } & { [k: string]: never };
}

function makeService(tx: unknown) {
  const tenantFactory = () => tx;
  return new TeamsService(
    { $transaction: (cb: (t: unknown) => Promise<unknown>) => cb(tx) } as never,
    tenantFactory as never,
    createOutboxWriter('apps/api'),
    new AuditService(),
    new DomainOperations(new HttpMetrics()),
  );
}

function delegates(tx: unknown, name: string): Record<string, Fn> {
  return (tx as Record<string, Record<string, Fn>>)[name] ?? {};
}

function outboxRows(tx: unknown): Array<Record<string, unknown>> {
  const calls = delegates(tx, 'outboxEvent')['createMany']?.mock.calls ?? [];
  return calls.flatMap((c) => (c[0] as { data: Array<Record<string, unknown>> }).data);
}

function p2002(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

describe('TeamsService.createTeam', () => {
  it('creates team + audit + aca.team.created event (no department)', async () => {
    const tx = makeFake({});
    delegates(tx, 'team')['create']?.mockResolvedValue(teamRow());
    const svc = makeService(tx);
    const dto = await svc.createTeam(ORG_ID, { name: 'Shorts Squad' });
    expect(dto.memberCount).toBe(0);
    const createArgs = delegates(tx, 'team')['create']?.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(createArgs.data).toMatchObject({ orgId: ORG_ID, name: 'Shorts Squad', departmentId: null });
    const rows = outboxRows(tx);
    expect(rows[0]?.['type']).toBe('aca.team.created');
    expect((rows[0]?.['payload'] as { payload: Record<string, unknown> }).payload).toMatchObject({ orgId: ORG_ID, teamId: TEAM_ID, name: 'Shorts Squad' });
    expect('departmentId' in ((rows[0]?.['payload'] as { payload: Record<string, unknown> }).payload)).toBe(false);
  });

  it('validates department belongs to the org (outside -> NOT_FOUND, no create)', async () => {
    const tx = makeFake({});
    delegates(tx, 'department')['findFirst']?.mockResolvedValue(null);
    const svc = makeService(tx);
    await expect(svc.createTeam(ORG_ID, { name: 'X', departmentId: DEPT_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(delegates(tx, 'team')['create']).not.toHaveBeenCalled();
  });

  it('duplicate name (orgId,name) -> CONFLICT', async () => {
    const tx = makeFake({});
    delegates(tx, 'department')['findFirst']?.mockResolvedValue({ id: DEPT_ID });
    delegates(tx, 'team')['create']?.mockRejectedValue(p2002());
    const svc = makeService(tx);
    await expect(svc.createTeam(ORG_ID, { name: 'Shorts Squad', departmentId: DEPT_ID })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('TeamsService.listTeams', () => {
  it('returns limit items + nextCursor from the extra row', async () => {
    const rows = [
      { ...teamRow({ id: 'a1' }), _count: { members: 2 } },
      { ...teamRow({ id: 'b2' }), _count: { members: 0 } },
    ];
    const tx = makeFake({});
    delegates(tx, 'team')['findMany']?.mockResolvedValue(rows);
    const svc = makeService(tx);
    const page = await svc.listTeams(ORG_ID, { limit: 1 });
    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.memberCount).toBe(2);
    expect(page.nextCursor).toBe('a1');
    const findArgs = delegates(tx, 'team')['findMany']?.mock.calls[0]?.[0] as { take: number };
    expect(findArgs.take).toBe(2);
  });

  it('nextCursor null on the last page', async () => {
    const tx = makeFake({});
    delegates(tx, 'team')['findMany']?.mockResolvedValue([{ ...teamRow(), _count: { members: 1 } }]);
    const svc = makeService(tx);
    const page = await svc.listTeams(ORG_ID, { limit: 50 });
    expect(page.nextCursor).toBeNull();
  });
});

describe('TeamsService.updateTeam', () => {
  it('explicit null departmentId detaches (hasOwnProperty semantics) and lists it in changed[]', async () => {
    const tx = makeFake({});
    delegates(tx, 'team')['update']?.mockResolvedValue(teamRow({ departmentId: null }));
    const svc = makeService(tx);
    await svc.updateTeam(ORG_ID, TEAM_ID, { departmentId: null });
    const updateArgs = delegates(tx, 'team')['update']?.mock.calls[0]?.[0] as { where: { id: string }; data: Record<string, unknown> };
    expect(updateArgs.where.id).toBe(TEAM_ID);
    expect(updateArgs.data).toEqual({ departmentId: null });
    const rows = outboxRows(tx);
    expect((rows[0]?.['payload'] as { payload: Record<string, unknown> }).payload).toMatchObject({ changed: ['departmentId'] });
  });

  it('attaching a department requires it to exist in the org', async () => {
    const tx = makeFake({});
    delegates(tx, 'department')['findFirst']?.mockResolvedValue(null);
    const svc = makeService(tx);
    await expect(svc.updateTeam(ORG_ID, TEAM_ID, { departmentId: DEPT_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(delegates(tx, 'team')['update']).not.toHaveBeenCalled();
  });
});

describe('TeamsService.deleteTeam', () => {
  it('removes members, detaches projects to ORG_WIDE, deletes, audits + events counts', async () => {
    const tx = makeFake({});
    delegates(tx, 'team')['findFirst']?.mockResolvedValue({ id: TEAM_ID });
    delegates(tx, 'teamMember')['deleteMany']?.mockResolvedValue({ count: 3 });
    delegates(tx, 'project')['updateMany']?.mockResolvedValue({ count: 2 });
    delegates(tx, 'team')['delete']?.mockResolvedValue(teamRow());
    const svc = makeService(tx);
    const result = await svc.deleteTeam(ORG_ID, TEAM_ID);
    expect(result).toEqual({ deleted: true, membersRemoved: 3, projectsDetached: 2 });
    const detachArgs = delegates(tx, 'project')['updateMany']?.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(detachArgs.data).toEqual({ teamId: null, visibility: 'ORG_WIDE' });
    const rows = outboxRows(tx);
    expect((rows[0]?.['payload'] as { payload: unknown }).payload).toMatchObject({ membersRemoved: 3, projectsDetached: 2 });
  });

  it('missing team -> NOT_FOUND with zero destructive calls', async () => {
    const tx = makeFake({});
    delegates(tx, 'team')['findFirst']?.mockResolvedValue(null);
    const svc = makeService(tx);
    await expect(svc.deleteTeam(ORG_ID, TEAM_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(delegates(tx, 'teamMember')['deleteMany']).not.toHaveBeenCalled();
    expect(delegates(tx, 'team')['delete']).not.toHaveBeenCalled();
  });
});

describe('TeamsService membership', () => {
  it('addMember requires ACTIVE org membership first', async () => {
    const tx = makeFake({});
    delegates(tx, 'team')['findFirst']?.mockResolvedValue({ id: TEAM_ID });
    const fakeOrgMembers = { findFirst: vi.fn().mockResolvedValue(null) };
    (tx as Record<string, unknown>)['organizationMember'] = fakeOrgMembers;
    const svc = makeService(tx);
    await expect(svc.addMember(ORG_ID, TEAM_ID, { userId: USER_ID })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('addMember duplicate -> CONFLICT; removeMember missing -> NOT_FOUND; removeMember happy -> event', async () => {
    const tx = makeFake({});
    delegates(tx, 'team')['findFirst']?.mockResolvedValue({ id: TEAM_ID });
    (tx as Record<string, unknown>)['organizationMember'] = { findFirst: vi.fn().mockResolvedValue({ id: 'm1' }) };
    delegates(tx, 'teamMember')['create']?.mockRejectedValueOnce(p2002());
    const svc = makeService(tx);
    await expect(svc.addMember(ORG_ID, TEAM_ID, { userId: USER_ID })).rejects.toMatchObject({ code: 'CONFLICT' });

    delegates(tx, 'teamMember')['deleteMany']?.mockResolvedValueOnce({ count: 0 });
    await expect(svc.removeMember(ORG_ID, TEAM_ID, USER_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    delegates(tx, 'teamMember')['deleteMany']?.mockResolvedValueOnce({ count: 1 });
    const ok = await svc.removeMember(ORG_ID, TEAM_ID, USER_ID);
    expect(ok).toEqual({ removed: true });
    const rows = outboxRows(tx);
    expect(rows.at(-1)?.['type']).toBe('aca.team.member_removed');
  });
});
