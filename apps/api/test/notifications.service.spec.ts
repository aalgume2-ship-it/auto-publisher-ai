/**
 * NotificationsService — unit tests (mock Prisma).
 * Covers: list (paged, unread filter, cursor, ownership),
 *          markRead (idempotent), markAllRead (transition count).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/common/errors/api-error.js';
import { NotificationsService, toNotificationDto } from '../src/modules/notifications/notifications.service.js';

interface FakeRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}

function makeDb(rows: FakeRow[], opts: { membersExist?: boolean } = {}) {
  const membersExist = opts.membersExist ?? true;
  return {
    notification: {
      // Respect the where + take clauses so list/unreadOnly/pagination work.
      findMany: vi.fn(async ({ where, take }: { where: { userId: string; readAt?: null; createdAt?: { lt: Date } }; take?: number }) => {
        let filtered = rows.filter((r) => r.userId === where.userId);
        if (where.readAt === null) filtered = filtered.filter((r) => r.readAt === null);
        if (where.createdAt?.lt !== undefined) filtered = filtered.filter((r) => r.createdAt < where.createdAt.lt!);
        // findMany results are already ordered desc by createdAt by the service's orderBy.
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take === undefined ? filtered : filtered.slice(0, take);
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
        rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null,
      ),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const r = rows.find((x) => x.id === where.id);
        if (r === undefined) throw new Error('not found');
        return r;
      }),
      count: vi.fn(async ({ where }: { where: { userId: string; readAt: null | object } }) => {
        if (where.readAt === null) {
          return rows.filter((r) => r.userId === where.userId && r.readAt === null).length;
        }
        return rows.filter((r) => r.userId === where.userId).length;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id?: string; userId?: string; readAt?: null }; data: { readAt: Date } }) => {
        // Two callers: markRead (where has id+userId+readAt:null) and
        // markAllRead (where has userId+readAt:null, no id).
        let matched = rows;
        if (where.id !== undefined) matched = matched.filter((r) => r.id === where.id);
        if (where.userId !== undefined) matched = matched.filter((r) => r.userId === where.userId);
        if (where.readAt === null) matched = matched.filter((r) => r.readAt === null);
        let count = 0;
        for (const r of matched) {
          r.readAt = data.readAt;
          count += 1;
        }
        return { count };
      }),
    },
    organizationMember: {
      findFirst: vi.fn(async () => (membersExist ? { id: 'm1' } : null)),
    },
  };
}

const CALLER = 'u1';
const ORG = 'o1';

describe('NotificationsService', () => {
  let svc: NotificationsService;

  beforeEach(() => {
    const db = makeDb([]);
    svc = new NotificationsService(db as never, { measure: (_m: string, _o: string, fn: () => Promise<unknown>) => fn() } as never);
  });

  it('toNotificationDto formats dates as ISO and passes through data/body', () => {
    const row: FakeRow = {
      id: 'n1', userId: 'u1', type: 'PUBLISHING', title: 'Ready', body: 'ok', data: { videoId: 'v1' },
      readAt: null, createdAt: new Date('2026-08-05T10:00:00.000Z'),
    };
    const dto = toNotificationDto(row);
    // The DTO strips userId — it's a per-user resource, not a per-userId resource.
    expect(dto).toEqual({
      id: 'n1', type: 'PUBLISHING', title: 'Ready', body: 'ok',
      data: { videoId: 'v1' }, readAt: null, createdAt: '2026-08-05T10:00:00.000Z',
    });
  });

  it('list throws 404 when caller is not a member of the org', async () => {
    const db = makeDb([], { membersExist: false });
    const svc2 = new NotificationsService(db as never, { measure: (_m: string, _o: string, fn: () => Promise<unknown>) => fn() } as never);
    await expect(svc2.list(ORG, CALLER, { limit: 20 })).rejects.toMatchObject({ status: 404, detail: 'Organization not found' });
  });

  it('list returns items + unreadCount + nextCursor', async () => {
    const now = Date.now();
    const rows: FakeRow[] = Array.from({ length: 3 }, (_, i) => ({
      id: `n${i}`, userId: 'u1', type: 'SYSTEM', title: `t${i}`, body: null, data: null,
      readAt: i === 0 ? null : new Date(now - i * 1000),
      createdAt: new Date(now - i * 1000),
    }));
    const db = makeDb(rows);
    const svc2 = new NotificationsService(db as never, { measure: (_m: string, _o: string, fn: () => Promise<unknown>) => fn() } as never);
    const res = await svc2.list(ORG, CALLER, { limit: 2 });
    expect(res.items).toHaveLength(2);
    expect(res.unreadCount).toBe(1);
    expect(res.nextCursor).not.toBeNull();
  });

  it('list with no overflow returns nextCursor=null', async () => {
    const rows: FakeRow[] = [{
      id: 'n1', userId: 'u1', type: 'SYSTEM', title: 't', body: null, data: null,
      readAt: null, createdAt: new Date(),
    }];
    const db = makeDb(rows);
    const svc2 = new NotificationsService(db as never, { measure: (_m: string, _o: string, fn: () => Promise<unknown>) => fn() } as never);
    const res = await svc2.list(ORG, CALLER, { limit: 20 });
    expect(res.items).toHaveLength(1);
    expect(res.nextCursor).toBeNull();
  });

  it('list with unreadOnly=true filters to unread rows', async () => {
    const now = Date.now();
    const rows: FakeRow[] = [
      { id: 'a', userId: 'u1', type: 'SYSTEM', title: 'unread-1', body: null, data: null, readAt: null, createdAt: new Date(now - 2000) },
      { id: 'b', userId: 'u1', type: 'SYSTEM', title: 'read-1', body: null, data: null, readAt: new Date(now - 1000), createdAt: new Date(now - 1000) },
      { id: 'c', userId: 'u1', type: 'SYSTEM', title: 'unread-2', body: null, data: null, readAt: null, createdAt: new Date(now) },
    ];
    const db = makeDb(rows);
    const svc2 = new NotificationsService(db as never, { measure: (_m: string, _o: string, fn: () => Promise<unknown>) => fn() } as never);
    const res = await svc2.list(ORG, CALLER, { limit: 20, unreadOnly: true });
    expect(res.items).toHaveLength(2);
    expect(res.items.every((i) => i.readAt === null)).toBe(true);
  });

  it('markRead sets readAt on first call; second call is idempotent (same ts)', async () => {
    const now = new Date('2026-08-05T10:00:00.000Z');
    const rows: FakeRow[] = [{
      id: 'n1', userId: 'u1', type: 'PIPELINE', title: 't', body: null, data: null, readAt: null, createdAt: now,
    }];
    const db = makeDb(rows);
    const svc2 = new NotificationsService(db as never, { measure: (_m: string, _o: string, fn: () => Promise<unknown>) => fn() } as never);
    const first = await svc2.markRead(ORG, CALLER, 'n1');
    expect(typeof first.readAt).toBe('string');
    const second = await svc2.markRead(ORG, CALLER, 'n1');
    expect(first.readAt).toBe(second.readAt);
  });

  it('markRead throws 404 for a notification the caller does not own', async () => {
    const db = makeDb([]);
    const svc2 = new NotificationsService(db as never, { measure: (_m: string, _o: string, fn: () => Promise<unknown>) => fn() } as never);
    await expect(svc2.markRead(ORG, CALLER, 'does-not-exist')).rejects.toMatchObject({ status: 404, detail: 'Notification not found' });
  });

  it('markAllRead returns the count of rows that transitioned', async () => {
    const now = new Date();
    const rows: FakeRow[] = [
      { id: 'n1', userId: 'u1', type: 'SYSTEM', title: 'a', body: null, data: null, readAt: null, createdAt: now },
      { id: 'n2', userId: 'u1', type: 'SYSTEM', title: 'b', body: null, data: null, readAt: null, createdAt: now },
      { id: 'n3', userId: 'u1', type: 'SYSTEM', title: 'c', body: null, data: null, readAt: new Date(now), createdAt: now },
    ];
    const db = makeDb(rows);
    const svc2 = new NotificationsService(db as never, { measure: (_m: string, _o: string, fn: () => Promise<unknown>) => fn() } as never);
    const res = await svc2.markAllRead(ORG, CALLER);
    expect(res.updated).toBe(2);
  });
});
