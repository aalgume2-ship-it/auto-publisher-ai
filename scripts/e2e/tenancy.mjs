#!/usr/bin/env node
/**
 * TENANCY E2E — verify cross-company isolation at the API level.
 * User A's token must NEVER read User B's videos/assets/campaigns.
 */
const BASE = 'http://localhost:4000';
const ts = Date.now();
const PASSWORD = 'Riyadh-2026!e2e-passphrase';

let pass = 0, fail = 0;
const log = (label, ok, info = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${info ? ' — ' + info : ''}`);
  ok ? pass++ : fail++;
};

async function call(method, path, { body, token, expect } = {}) {
  const res = await fetch(`${BASE}/v1/${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method !== 'GET' && method !== 'HEAD' ? { 'Idempotency-Key': `ten-${Date.now()}-${Math.random().toString(36).slice(2)}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  const ok = expect ? expect.includes(res.status) : res.ok;
  return { status: res.status, body: json, ok };
}

(async () => {
  // ── create TWO users with their own orgs ──
  const rA = await call('POST', 'auth/register', { body: { email: `ten.a.${ts}@example.com`, password: PASSWORD, displayName: 'Tenant A', locale: 'en', timezone: 'UTC' } });
  const rB = await call('POST', 'auth/register', { body: { email: `ten.b.${ts}@example.com`, password: PASSWORD, displayName: 'Tenant B', locale: 'en', timezone: 'UTC' } });
  log('two users registered', rA.ok && rB.ok);
  const tokenA = rA.body?.tokens?.accessToken;
  const tokenB = rB.body?.tokens?.accessToken;

  const oA = await call('POST', 'organizations', { body: { name: `Company A ${ts}`, timezone: 'UTC', defaultLocale: 'en' }, token: tokenA }, { expect: [201] });
  const oB = await call('POST', 'organizations', { body: { name: `Company B ${ts}`, timezone: 'UTC', defaultLocale: 'en' }, token: tokenB }, { expect: [201] });
  const orgA = oA.body?.id, orgB = oB.body?.id;
  log('two orgs created', !!orgA && !!orgB);

  // A creates a series + video + asset + campaign
  const sA = await call('POST', `organizations/${orgA}/series`, { body: { name: 'A secret series', niche: 'science', language: 'en' }, token: tokenA }, { expect: [201] });
  log('A created series', sA.ok);
  const vA = await call('POST', `organizations/${orgA}/series/${sA.body.id}/videos`, { body: { keyword: 'SECRET-A-CONTENT', targetSeconds: 30 }, token: tokenA }, { expect: [201] });
  log('A created video', vA.ok);
  const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const uA = await call('POST', `organizations/${orgA}/assets/upload`, { body: { fileName: 'a.png', mimeType: 'image/png', kind: 'IMAGE', tags: [], base64: png1x1.toString('base64') }, token: tokenA }, { expect: [201] });
  log('A uploaded asset', uA.ok);
  const cA = await call('POST', `organizations/${orgA}/campaigns`, { body: { name: 'A campaign', platforms: ['youtube'], cadence: 'daily', timeOfDay: '18:00', timezone: 'UTC', contentMode: 'auto', referenceImageIds: [], config: {} }, token: tokenA }, { expect: [201] });
  log('A created campaign', cA.ok);

  // ── B tries to READ A's resources → must 404/403 (NOT_FOUND masking) ──
  let r = await call('GET', `organizations/${orgA}/videos/${vA.body?.video?.id || vA.body?.id}`, { token: tokenB });
  log('B cannot read A video', [404, 403].includes(r.status), `status=${r.status}`);
  r = await call('GET', `organizations/${orgA}/series`, { token: tokenB });
  log('B cannot list A series', r.status === 404 || r.body?.items?.length === 0, `status=${r.status} items=${r.body?.items?.length}`);
  r = await call('GET', `organizations/${orgA}/assets`, { token: tokenB });
  log('B cannot list A assets', r.status === 404 || r.body?.items?.length === 0, `status=${r.status} items=${r.body?.items?.length}`);
  r = await call('GET', `organizations/${orgA}/library?type=videos`, { token: tokenB });
  log('B cannot read A library', r.status === 404 || r.body?.items?.length === 0, `status=${r.status} items=${r.body?.items?.length}`);
  r = await call('GET', `organizations/${orgA}/campaigns`, { token: tokenB });
  log('B cannot read A campaigns', r.status === 404 || r.body?.items?.length === 0, `status=${r.status} items=${r.body?.items?.length}`);
  r = await call('GET', `organizations/${orgA}/dashboard`, { token: tokenB });
  log('B cannot read A dashboard', r.status === 404 || r.body?.totals?.videos === 0, `status=${r.status}`);
  r = await call('POST', `organizations/${orgA}/videos/${vA.body?.video?.id || vA.body?.id}/regenerate`, { token: tokenB });
  log('B cannot act on A video', [404, 403].includes(r.status), `status=${r.status}`);

  // A can still read its own
  r = await call('GET', `organizations/${orgA}/videos/${vA.body?.video?.id || vA.body?.id}`, { token: tokenA });
  log('A can read own video', r.ok, `status=${r.status}`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
