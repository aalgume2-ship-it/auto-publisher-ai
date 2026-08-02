/**
 * Organizations module — HTTP integration suite. REAL Postgres + Redis, full
 * AppModule, fastify .inject(). Covers every endpoint of Module 1 plus the
 * platform invariants the sponsor named: tenant isolation (cross-org = 404),
 * idempotent replay, RFC 9457 error shape, and perf stats for key operations.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, generateId } from '@aca/database';
import { IT, authed, bootApp, problemOf, seedSubscription, seedUser, type ItApp } from './kit.js';

const slugBase = `it-org-${randomUUID().slice(0, 8)}`;
const perf: Array<{ op: string; ms: number }> = [];

async function timed<T>(op: string, fn: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const result = await fn();
  perf.push({ op, ms: performance.now() - started });
  return result;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? 0;
}

describe.skipIf(!IT)('organizations module — integration (real PG + Redis)', () => {
  let kit: ItApp;
  let owner: { id: string };
  let ownerClient: ReturnType<typeof authed>;
  let orgId = '';
  let deptId = '';
  let teamId = '';
  let domainId = '';
  const planIds: string[] = [];

  beforeAll(async () => {
    const db = createPrismaClient();
    kit = await bootApp(db);
    owner = await seedUser(db, 'owner');
    ownerClient = authed(owner.id);
  }, 60000);

  afterAll(async () => {
    const db = kit.db;
    if (orgId !== '') {
      await db.idempotencyRecord.deleteMany({ where: { orgId } });
      await db.outboxEvent.deleteMany({ where: { orgId } });
      await db.auditLog.deleteMany({ where: { orgId } });
      await db.organization.deleteMany({ where: { id: orgId } });
    }
    for (const code of await db.plan.findMany({ where: { code: { startsWith: 'it-plan-' } }, select: { id: true } })) {
      planIds.push(code.id);
    }
    await db.plan.deleteMany({ where: { code: { startsWith: 'it-plan-' } } });
    await db.user.deleteMany({ where: { id: owner.id } });
    await kit.close();
    await db.$disconnect();
    // perf evidence — always printed (assertions below use generous CI ceilings)
    const byOp = new Map<string, number[]>();
    for (const { op, ms } of perf) byOp.set(op, [...(byOp.get(op) ?? []), ms]);
    for (const [op, ms] of byOp) {
      // eslint-disable-next-line no-console
      console.log(`[perf] ${op}: n=${ms.length} p50=${percentile(ms, 50).toFixed(1)}ms p95=${percentile(ms, 95).toFixed(1)}ms max=${Math.max(...ms).toFixed(1)}ms`);
    }
  });

  /* ---------------- organization entity ---------------- */

  it('POST /v1/organizations requires auth (401 with RFC 9457 body)', async () => {
    const res = await kit.app.inject({ method: 'POST', url: '/v1/organizations', payload: { name: 'X' } });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(problemOf(res)['code']).toBe('UNAUTHENTICATED');
  });

  it('POST /v1/organizations creates org + OWNER membership; idempotent replay is byte-identical', async () => {
    const key = randomUUID();
    const body = JSON.stringify({ name: 'IT Noor Media', slug: slugBase });
    const first = await timed('organization.create', () =>
      kit.app.inject({ method: 'POST', url: '/v1/organizations', headers: ownerClient.headers({ 'idempotency-key': key }), payload: body }),
    );
    expect(first.statusCode).toBe(201);
    orgId = (first.json() as { id: string }).id;
    expect(orgId).toMatch(/^[0-9a-f-]{36}$/);

    const replay = await kit.app.inject({ method: 'POST', url: '/v1/organizations', headers: ownerClient.headers({ 'idempotency-key': key }), payload: body });
    expect(replay.statusCode).toBe(201);
    expect(replay.body).toBe(first.body); // byte-identical replay

    const count = await kit.db.organization.count({ where: { slug: slugBase } });
    expect(count).toBe(1); // exactly one write survived the replay

    const events = await kit.db.outboxEvent.count({ where: { orgId, type: 'aca.organization.created' } });
    expect(events).toBe(1);
    const audits = await kit.db.auditLog.count({ where: { orgId, action: 'organization.created', actorId: owner.id } });
    expect(audits).toBe(1);
  });

  it('POST /v1/organizations with duplicate slug -> 409 CONFLICT (problem shape)', async () => {
    const res = await kit.app.inject({
      method: 'POST',
      url: '/v1/organizations',
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { name: 'Copycat', slug: slugBase },
    });
    expect(res.statusCode).toBe(409);
    expect(problemOf(res)['code']).toBe('CONFLICT');
  });

  it('POST /v1/organizations validation failure -> 400 VALIDATION_FAILED with issues', async () => {
    const res = await kit.app.inject({
      method: 'POST',
      url: '/v1/organizations',
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(problemOf(res)['code']).toBe('VALIDATION_FAILED');
  });

  it('GET detail → PATCH profile → settings get/patch → security-policy merge', async () => {
    const detail = await timed('organization.get', () =>
      kit.app.inject({ method: 'GET', url: `/v1/organizations/${orgId}`, headers: ownerClient.headers() }),
    );
    expect(detail.statusCode).toBe(200);
    expect((detail.json() as { counts: { members: number } }).counts.members).toBe(1);

    const patched = await kit.app.inject({
      method: 'PATCH',
      url: `/v1/organizations/${orgId}`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { name: 'IT Noor Media Group' },
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { name: string }).name).toBe('IT Noor Media Group');

    const patchSettings = await kit.app.inject({
      method: 'PATCH',
      url: `/v1/organizations/${orgId}/settings`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { timezone: 'Asia/Riyadh', defaultLocale: 'ar-SA' },
    });
    expect(patchSettings.statusCode).toBe(200);
    expect((patchSettings.json() as { timezone: string }).timezone).toBe('Asia/Riyadh');

    const sec = await kit.app.inject({
      method: 'PATCH',
      url: `/v1/organizations/${orgId}/settings/security-policy`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { enforceMfa: true, sessionMaxHours: 12 },
    });
    expect(sec.statusCode).toBe(200);
    expect((sec.json() as { securityPolicy: Record<string, unknown> }).securityPolicy).toMatchObject({
      enforceMfa: true,
      sessionMaxHours: 12,
      enforceSso: false,
    });

    const events = await kit.db.outboxEvent.count({
      where: { orgId, type: 'aca.organization.settings_updated', payload: { path: ['section'], equals: 'security_policy' } },
    });
    expect(events).toBe(1);
  });

  /* ---------------- departments ---------------- */

  it('departments: create → dup 409 → list → detail → patch', async () => {
    const created = await timed('department.create', () =>
      kit.app.inject({
        method: 'POST',
        url: `/v1/organizations/${orgId}/departments`,
        headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
        payload: { name: 'Content Production' },
      }),
    );
    expect(created.statusCode).toBe(201);
    deptId = (created.json() as { id: string }).id;
    expect((created.json() as { slug: string }).slug).toBe('content-production');

    const dup = await kit.app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/departments`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { name: 'Content Production' },
    });
    expect(dup.statusCode).toBe(409);

    const list = await kit.app.inject({ method: 'GET', url: `/v1/organizations/${orgId}/departments`, headers: ownerClient.headers() });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { data: unknown[] }).data).toHaveLength(1);
    expect((list.json() as { nextCursor: unknown }).nextCursor).toBeNull();

    const patched = await kit.app.inject({
      method: 'PATCH',
      url: `/v1/organizations/${orgId}/departments/${deptId}`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { description: 'All video-producing teams' },
    });
    expect(patched.statusCode).toBe(200);
  });

  /* ---------------- teams + members ---------------- */

  it('teams: create with department → member lifecycle → delete with detach counts', async () => {
    const badDept = await kit.app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/teams`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { name: 'Ghost Team', departmentId: generateId() },
    });
    expect(badDept.statusCode).toBe(404);

    const created = await timed('team.create', () =>
      kit.app.inject({
        method: 'POST',
        url: `/v1/organizations/${orgId}/teams`,
        headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
        payload: { name: 'Shorts Squad', departmentId: deptId },
      }),
    );
    expect(created.statusCode).toBe(201);
    teamId = (created.json() as { id: string }).id;

    const member = await seedUser(kit.db, 'editor');
    const notMemberYet = await kit.app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/teams/${teamId}/members`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { userId: member.id },
    });
    expect(notMemberYet.statusCode).toBe(404); // not an org member yet

    await kit.db.organizationMember.create({
      data: { id: generateId(), orgId, userId: member.id, role: 'EDITOR', status: 'ACTIVE' },
    });
    const added = await kit.app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/teams/${teamId}/members`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { userId: member.id },
    });
    expect(added.statusCode).toBe(201);

    const dupMember = await kit.app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/teams/${teamId}/members`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { userId: member.id },
    });
    expect(dupMember.statusCode).toBe(409);

    const detail = await timed('team.get', () =>
      kit.app.inject({ method: 'GET', url: `/v1/organizations/${orgId}/teams/${teamId}`, headers: ownerClient.headers() }),
    );
    expect((detail.json() as { members: unknown[] }).members).toHaveLength(1);
    expect((detail.json() as { memberCount: number }).memberCount).toBe(1);

    const removed = await kit.app.inject({
      method: 'DELETE',
      url: `/v1/organizations/${orgId}/teams/${teamId}/members/${member.id}`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
    });
    expect(removed.statusCode).toBe(200);

    const deleted = await kit.app.inject({
      method: 'DELETE',
      url: `/v1/organizations/${orgId}/teams/${teamId}`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({ deleted: true, projectsDetached: 0 });
    await kit.db.user.delete({ where: { id: member.id } });
  });

  /* ---------------- branding + branding/resolve ---------------- */

  it('branding: defaults → put (whiteLabel entitled) → reset; public resolve only for ACTIVE domains', async () => {
    const defaults = await kit.app.inject({ method: 'GET', url: `/v1/organizations/${orgId}/brand`, headers: ownerClient.headers() });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json()).toMatchObject({ primaryColor: '#7c3aed', hidePoweredBy: false });

    await seedSubscription(kit.db, orgId);
    const put = await kit.app.inject({
      method: 'PUT',
      url: `/v1/organizations/${orgId}/brand`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { brandName: 'Noor Podcasts', primaryColor: '#1a7a4a', hidePoweredBy: true },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ brandName: 'Noor Podcasts', hidePoweredBy: true });

    const unknown = await kit.app.inject({ method: 'GET', url: '/v1/branding/resolve?host=unknown.example' });
    expect(unknown.statusCode).toBe(404);

    await kit.db.customDomain.create({
      data: {
        id: generateId(),
        orgId,
        domain: 'portal.it-noor.example',
        type: 'PORTAL',
        status: 'ACTIVE',
        verificationToken: 'aca-verify=x',
        activatedAt: new Date(),
      },
    });
    const resolved = await kit.app.inject({ method: 'GET', url: '/v1/branding/resolve?host=portal.it-noor.example' });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ orgSlug: slugBase, localeDefault: 'ar-SA' });

    const reset = await kit.app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/brand/reset`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({ primaryColor: '#7c3aed', brandName: null });
  });

  /* ---------------- domains ---------------- */

  it('domains: register → real TXT verify (stubbed resolver) → mismatch 409 + FAILED persisted → delete', async () => {
    const created = await kit.app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/domains`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { domain: 'portal.it-noor2.example', type: 'PORTAL' },
    });
    expect(created.statusCode).toBe(201);
    domainId = (created.json() as { id: string }).id;
    const token = (created.json() as { verificationToken: string }).verificationToken;
    expect(token).toMatch(/^aca-verify=[0-9a-f]{48}$/);

    kit.dns.resolveTxtRecord.mockResolvedValueOnce([]);
    const failed = await kit.app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/domains/${domainId}/verify`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
    });
    expect(failed.statusCode).toBe(409);
    expect(problemOf(failed)['code']).toBe('DOMAIN_VERIFICATION_FAILED');
    const row = await kit.db.customDomain.findUnique({ where: { id: domainId } });
    expect(row?.status).toBe('FAILED');
    expect(row?.lastCheckedAt).not.toBeNull();

    kit.dns.resolveTxtRecord.mockResolvedValueOnce([token]);
    const ok = await kit.app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/domains/${domainId}/verify`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: 'ACTIVE' });

    const deleted = await kit.app.inject({
      method: 'DELETE',
      url: `/v1/organizations/${orgId}/domains/${domainId}`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
    });
    expect(deleted.statusCode).toBe(200);
  });

  /* ---------------- billing profile + subscription ---------------- */

  it('billing: profile create requires email → upsert → read; subscription + credit balance', async () => {
    const noEmail = await kit.app.inject({
      method: 'PUT',
      url: `/v1/organizations/${orgId}/billing-profile`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { legalName: 'Noor LLC' },
    });
    expect(noEmail.statusCode).toBe(400);

    const put = await kit.app.inject({
      method: 'PUT',
      url: `/v1/organizations/${orgId}/billing-profile`,
      headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { legalName: 'Noor Media Holding LLC', billingEmail: 'billing@noor.example', countryCode: 'SA' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ billingEmail: 'billing@noor.example', countryCode: 'SA' });

    const read = await kit.app.inject({ method: 'GET', url: `/v1/organizations/${orgId}/billing-profile`, headers: ownerClient.headers() });
    expect(read.statusCode).toBe(200);

    await kit.db.aiCreditTransaction.create({
      data: { id: generateId(), orgId, delta: 500, balanceAfter: 5500, reason: 'MONTHLY_GRANT' },
    });
    const sub = await timed('subscription.get', () =>
      kit.app.inject({ method: 'GET', url: `/v1/organizations/${orgId}/subscription`, headers: ownerClient.headers() }),
    );
    expect(sub.statusCode).toBe(200);
    expect(sub.json()).toMatchObject({
      subscription: { status: 'ACTIVE', plan: { features: { whiteLabel: true } } },
      credits: { balance: 5500 },
    });
  });

  /* ---------------- tenant isolation ---------------- */

  it('cross-tenant reads are masked as 404 (membership oracle defense)', async () => {
    const outsider = await seedUser(kit.db, 'outsider');
    const outsiderClient = authed(outsider.id);
    const own = await kit.app.inject({
      method: 'POST',
      url: '/v1/organizations',
      headers: outsiderClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { name: 'Outsider Org' },
    });
    expect(own.statusCode).toBe(201);
    const ownOrgId = (own.json() as { id: string }).id;

    const readA = await kit.app.inject({ method: 'GET', url: `/v1/organizations/${orgId}`, headers: outsiderClient.headers() });
    expect(readA.statusCode).toBe(404);
    const teamsA = await kit.app.inject({ method: 'GET', url: `/v1/organizations/${orgId}/teams`, headers: outsiderClient.headers() });
    expect(teamsA.statusCode).toBe(404);
    const mutateA = await kit.app.inject({
      method: 'PATCH',
      url: `/v1/organizations/${orgId}`,
      headers: outsiderClient.headers({ 'idempotency-key': randomUUID() }),
      payload: { name: 'hijacked' },
    });
    expect(mutateA.statusCode).toBe(404);
    const untouched = await kit.db.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    expect(untouched?.name).toBe('IT Noor Media Group');

    await kit.db.idempotencyRecord.deleteMany({ where: { orgId: ownOrgId } });
    await kit.db.outboxEvent.deleteMany({ where: { orgId: ownOrgId } });
    await kit.db.auditLog.deleteMany({ where: { orgId: ownOrgId } });
    await kit.db.organization.delete({ where: { id: ownOrgId } });
    await kit.db.user.delete({ where: { id: outsider.id } });
  });

  /* ---------------- perf check (assertions with generous CI ceilings) ---------------- */

  it('key operations stay within CI perf ceilings', async () => {
    for (let i = 0; i < 12; i += 1) {
      const res = await timed('team.create.loop', () =>
        kit.app.inject({
          method: 'POST',
          url: `/v1/organizations/${orgId}/teams`,
          headers: ownerClient.headers({ 'idempotency-key': randomUUID() }),
          payload: { name: `Perf Team ${i}` },
        }),
      );
      expect(res.statusCode).toBe(201);
    }
    for (let i = 0; i < 12; i += 1) {
      await timed('team.list.loop', () =>
        kit.app.inject({ method: 'GET', url: `/v1/organizations/${orgId}/teams?limit=50`, headers: ownerClient.headers() }),
      );
    }
    const creates = perf.filter((p) => p.op === 'team.create.loop').map((p) => p.ms);
    const lists = perf.filter((p) => p.op === 'team.list.loop').map((p) => p.ms);
    expect(percentile(creates, 95)).toBeLessThan(2000);
    expect(percentile(lists, 95)).toBeLessThan(1000);
  });
});
