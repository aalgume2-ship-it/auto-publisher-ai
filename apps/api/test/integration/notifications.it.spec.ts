/**
 * Notifications module — HTTP integration suite. REAL Postgres + Redis, full
 * AppModule, fastify .inject(). Covers the per-user inbox surface:
 *   GET   /v1/organizations/:orgId/notifications
 *   PATCH /v1/organizations/:orgId/notifications/:notificationId/read
 *   PATCH /v1/organizations/:orgId/notifications/read-all
 *
 * Cross-tenant access is impossible by construction (rows are filtered by
 * the caller's userId; the /:orgId anchor is just the membership gate).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, generateId } from '@aca/database';
import { IT, authed, bootApp, seedUser, type ItApp } from './kit.js';

const slugBase = `it-notif-${randomUUID().slice(0, 8)}`;

describe.skipIf(!IT)('notifications module — integration (real PG + Redis)', () => {
  let kit: ItApp;
  let owner: { id: string; email: string };
  let ownerClient: ReturnType<typeof authed>;
  let other: { id: string; email: string };
  let otherClient: ReturnType<typeof authed>;
  let orgId = '';

  beforeAll(async () => {
    const db = createPrismaClient();
    kit = await bootApp(db);
    owner = await seedUser(db, 'notif-owner');
    other = await seedUser(db, 'notif-other');
    ownerClient = authed(owner.id);
    otherClient = authed(other.id);
  }, 60_000);

  afterAll(async () => {
    const db = kit.db;
    if (orgId !== '') {
      await db.organizationMember.deleteMany({ where: { orgId } });
      await db.organization.deleteMany({ where: { id: orgId } });
    }
    await db.notification.deleteMany({ where: { userId: { in: [owner.id, other.id] } } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await kit.close();
    await createPrismaClient().$disconnect();
  });

  it('GET /v1/organizations/:orgId/notifications requires auth (401)', async () => {
    const res = await kit.app.inject({ method: 'GET', url: '/v1/organizations/00000000-0000-7000-8000-000000000000/notifications' });
    expect(res.statusCode).toBe(401);
  });

  it('full surface: create org → seed notifications → list → mark one → mark all', async () => {
    // Create an org as owner
    const key = randomUUID();
    const create = await kit.app.inject({
      method: 'POST',
      url: '/v1/organizations',
      headers: ownerClient.headers({ 'idempotency-key': key }),
      payload: JSON.stringify({ name: 'IT Notif Studio', slug: slugBase }),
    });
    expect(create.statusCode).toBe(201);
    orgId = (create.json() as { id: string }).id;

    // Add the "other" user as a member too (so they can hit the endpoint
    // with a 403, then we verify per-user isolation).
    await kit.db.organizationMember.create({
      data: { id: generateId(), orgId, userId: other.id, role: 'VIEWER', status: 'ACTIVE' },
    });

    // Seed 3 notifications for owner, 1 for other.
    const ownerNotifs = [
      { id: generateId(), userId: owner.id, type: 'PUBLISHING' as const, title: 'Video ready', body: 'ok', data: { videoId: 'v1' }, readAt: null, createdAt: new Date('2026-08-05T10:00:00.000Z') },
      { id: generateId(), userId: owner.id, type: 'BILLING' as const, title: 'Invoice paid', body: null, data: null, readAt: null, createdAt: new Date('2026-08-05T09:00:00.000Z') },
      { id: generateId(), userId: owner.id, type: 'SECURITY' as const, title: 'New login', body: 'Chrome on macOS', data: { ip: '1.2.3.4' }, readAt: new Date('2026-08-05T08:00:00.000Z'), createdAt: new Date('2026-08-05T08:00:00.000Z') },
    ];
    const otherNotif = { id: generateId(), userId: other.id, type: 'SYSTEM' as const, title: 'Welcome', body: null, data: null, readAt: null, createdAt: new Date() };
    await kit.db.notification.createMany({ data: [...ownerNotifs, otherNotif] });

    // List as owner
    const list = await kit.app.inject({
      method: 'GET',
      url: `/v1/organizations/${orgId}/notifications?limit=20`,
      headers: ownerClient.headers(),
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json() as { items: Array<{ id: string; readAt: string | null }>; unreadCount: number; nextCursor: string | null };
    expect(listBody.items).toHaveLength(3);
    expect(listBody.unreadCount).toBe(2); // 2 unread for owner
    expect(listBody.nextCursor).toBeNull();
    const firstId = listBody.items[0]!.id;

    // Per-user isolation: "other" sees only their 1 notification, not owner's 3.
    const otherList = await kit.app.inject({
      method: 'GET',
      url: `/v1/organizations/${orgId}/notifications?limit=20`,
      headers: otherClient.headers(),
    });
    expect(otherList.statusCode).toBe(200);
    const otherBody = otherList.json() as { items: unknown[]; unreadCount: number };
    expect(otherBody.items).toHaveLength(1);
    expect(otherBody.unreadCount).toBe(1);

    // Mark one as read (owner) — unreadCount goes 2 → 1
    const mark = await kit.app.inject({
      method: 'PATCH',
      url: `/v1/organizations/${orgId}/notifications/${firstId}/read`,
      headers: ownerClient.headers(),
    });
    expect(mark.statusCode).toBe(200);
    const markBody = mark.json() as { id: string; readAt: string };
    expect(markBody.id).toBe(firstId);
    expect(typeof markBody.readAt).toBe('string');

    // Idempotency: second call returns the same readAt
    const mark2 = await kit.app.inject({
      method: 'PATCH',
      url: `/v1/organizations/${orgId}/notifications/${firstId}/read`,
      headers: ownerClient.headers(),
    });
    expect(mark2.statusCode).toBe(200);
    expect((mark2.json() as { readAt: string }).readAt).toBe(markBody.readAt);

    // Mark all read — 1 remaining unread (the other billing one)
    const all = await kit.app.inject({
      method: 'PATCH',
      url: `/v1/organizations/${orgId}/notifications/read-all`,
      headers: ownerClient.headers(),
    });
    expect(all.statusCode).toBe(200);
    expect((all.json() as { updated: number }).updated).toBe(1);

    // List again — all read now
    const list2 = await kit.app.inject({
      method: 'GET',
      url: `/v1/organizations/${orgId}/notifications?limit=20`,
      headers: ownerClient.headers(),
    });
    const list2Body = list2.json() as { unreadCount: number };
    expect(list2Body.unreadCount).toBe(0);

    // Cross-tenant isolation: owner cannot mark OTHER's notification read
    // (returns 404 — owner is not the owner of that row).
    const cross = await kit.app.inject({
      method: 'PATCH',
      url: `/v1/organizations/${orgId}/notifications/${otherNotif.id}/read`,
      headers: ownerClient.headers(),
    });
    expect(cross.statusCode).toBe(404);
  });

  it('GET with unreadOnly=true returns only unread rows', async () => {
    // Reuse the org + owner from the previous test. The owner now has 0 unread.
    // Seed one more unread row directly so we can test the filter.
    await kit.db.notification.create({
      data: {
        id: generateId(),
        userId: owner.id,
        type: 'TEAM',
        title: 'You were added to a team',
        body: null,
        data: null,
        readAt: null,
      },
    });
    const res = await kit.app.inject({
      method: 'GET',
      url: `/v1/organizations/${orgId}/notifications?unreadOnly=true&limit=20`,
      headers: ownerClient.headers(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ readAt: string | null }>; unreadCount: number };
    for (const item of body.items) expect(item.readAt).toBeNull();
    expect(body.unreadCount).toBeGreaterThanOrEqual(1);
  });

  it('GET from a user who is NOT a member of the org returns 404 (membership oracle defense)', async () => {
    // Create a new user with no membership in orgId
    const db = createPrismaClient();
    const stranger = await seedUser(db, 'notif-stranger');
    const strangerClient = authed(stranger.id);
    const res = await kit.app.inject({
      method: 'GET',
      url: `/v1/organizations/${orgId}/notifications?limit=20`,
      headers: strangerClient.headers(),
    });
    // The TenantGuard masks non-membership as 404 (does not leak org existence).
    // This is the same shape the org/billing/teams controllers rely on.
    expect(res.statusCode).toBe(404);
    // Cleanup
    await db.user.delete({ where: { id: stranger.id } });
    await db.$disconnect();
  });
});
