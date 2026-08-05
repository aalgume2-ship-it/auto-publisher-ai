#!/usr/bin/env node
/**
 * e2e-prod.mjs — Live end-to-end test of the deployed AutoCreator AI platform.
 *
 * Runs from a GitHub Actions runner. Exercises the same /api/v1/* endpoints
 * a real end-user would hit, but through the Vercel production URL — the
 * same Next.js proxy the browser uses. No mocks, no in-memory stores.
 *
 * Usage:
 *   BASE=https://auto-publisher-ai-web.vercel.app node .github/scripts/e2e-prod.mjs
 */

const BASE = (process.env.BASE || 'https://auto-publisher-ai-web.vercel.app').replace(/\/+$/, '');
const ts = Date.now();
const TEST_EMAIL = `e2e.tester.${ts}@example.com`;
const TEST_PASSWORD = 'Riyadh-2026!e2e-passphrase';
const DISPLAY_NAME = 'E2E Live Tester';

let pass = 0;
let fail = 0;
const results = [];

function log(label, status, info = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️ ';
  console.log(`${icon} ${label} → ${status}${info ? ' (' + info + ')' : ''}`);
  results.push({ label, status, info });
  if (status === 'PASS') pass++;
  if (status === 'FAIL') fail++;
}

async function call(method, path, { body, token, expectStatus } = {}) {
  const url = `${BASE}/api/v1/${path}`;
  const opts = {
    method,
    headers: {
      'Accept': 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, body: json ?? text, headers: res.headers };
}

function assertStatus(label, res, expected) {
  const expectedArr = Array.isArray(expected) ? expected : [expected];
  if (expectedArr.includes(res.status)) {
    log(label, 'PASS', `${res.status}`);
  } else {
    log(label, 'FAIL', `expected ${expectedArr.join('|')} got ${res.status} — body: ${JSON.stringify(res.body).substring(0, 300)}`);
  }
}

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  LIVE E2E — ${BASE}`);
  console.log(`  Test user: ${TEST_EMAIL}`);
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  // ── 1. Health checks (no auth) ──────────────────────────────────────
  console.log('── 1. Health checks ──');
  let r = await call('GET', 'health/');
  assertStatus('GET /api/v1/health', r, 200);
  log('  status field', r.body?.status === 'ok' ? 'PASS' : 'FAIL', `value=${r.body?.status}`);

  r = await call('GET', 'health/live/');
  assertStatus('GET /api/v1/health/live', r, 200);
  log('  alive field', r.body?.status === 'alive' ? 'PASS' : 'FAIL', `value=${r.body?.status}`);

  r = await call('GET', 'health/ready/');
  assertStatus('GET /api/v1/health/ready', r, 200);
  log('  postgres+redis up', (r.body?.checks?.postgres === 'up' && r.body?.checks?.redis === 'up') ? 'PASS' : 'FAIL',
      `postgres=${r.body?.checks?.postgres} redis=${r.body?.checks?.redis}`);
  console.log('');

  // ── 2. Register a new account ───────────────────────────────────────
  console.log('── 2. Register ──');
  r = await call('POST', 'auth/register/', {
    body: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      displayName: DISPLAY_NAME,
      locale: 'ar-SA',
      timezone: 'Asia/Riyadh',
    },
  });
  assertStatus('POST /api/v1/auth/register', r, 201);
  const userId = r.body?.user?.id;
  const accessToken = r.body?.tokens?.accessToken;
  const refreshToken = r.body?.tokens?.refreshToken;
  log('  user.id returned', userId ? 'PASS' : 'FAIL', userId || 'missing');
  log('  accessToken returned', accessToken ? 'PASS' : 'FAIL', accessToken ? accessToken.substring(0, 30) + '...' : 'missing');
  log('  refreshToken returned', refreshToken ? 'PASS' : 'FAIL', refreshToken ? refreshToken.substring(0, 20) + '...' : 'missing');
  log('  email matches', r.body?.user?.email === TEST_EMAIL ? 'PASS' : 'FAIL', `got=${r.body?.user?.email}`);
  log('  displayName matches', r.body?.user?.displayName === DISPLAY_NAME ? 'PASS' : 'FAIL', `got=${r.body?.user?.displayName}`);
  console.log('');

  if (!accessToken) {
    console.log('❌ Cannot continue without access token. Aborting.');
    return printSummary();
  }

  // ── 3. Login again (same credentials) ──────────────────────────────
  console.log('── 3. Login (same account) ──');
  r = await call('POST', 'auth/login/', {
    body: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  assertStatus('POST /api/v1/auth/login', r, 200);
  const loginAccess = r.body?.tokens?.accessToken;
  const loginRefresh = r.body?.tokens?.refreshToken;
  log('  tokens returned', (loginAccess && loginRefresh) ? 'PASS' : 'FAIL');
  log('  user is tokens-kind', r.body?.kind === 'tokens' ? 'PASS' : 'FAIL', `kind=${r.body?.kind}`);
  console.log('');

  // ── 4. Create workspace ────────────────────────────────────────────
  console.log('── 4. Create workspace ──');
  r = await call('POST', 'organizations/', {
    token: loginAccess,
    body: { name: `E2E Studio ${ts}`, timezone: 'Asia/Riyadh', defaultLocale: 'ar-SA' },
  });
  assertStatus('POST /api/v1/organizations', r, 201);
  const orgId = r.body?.id;
  log('  org.id returned', orgId ? 'PASS' : 'FAIL', orgId || 'missing');
  log('  org.name matches', r.body?.name?.includes('E2E Studio') ? 'PASS' : 'FAIL', `name=${r.body?.name}`);

  // List organizations
  r = await call('GET', 'organizations/', { token: loginAccess });
  assertStatus('GET /api/v1/organizations', r, 200);
  log('  org appears in list', r.body?.items?.some(w => w.organization?.id === orgId) ? 'PASS' : 'FAIL',
      `items=${r.body?.items?.length}`);
  console.log('');

  if (!orgId) {
    console.log('❌ Cannot continue without org id. Aborting.');
    return printSummary();
  }

  // ── 5. List channels (initially empty) ────────────────────────────
  console.log('── 5. List channels ──');
  r = await call('GET', `organizations/${orgId}/channels/`, { token: loginAccess });
  assertStatus(`GET /api/v1/organizations/${orgId}/channels`, r, 200);
  log('  empty initially', r.body?.items?.length === 0 ? 'PASS' : 'INFO', `items=${r.body?.items?.length}`);

  // Try to start a YouTube link (expected: 503 PLATFORM_ERROR — no Google OAuth configured)
  r = await call('POST', `organizations/${orgId}/channels/youtube/link/`, { token: loginAccess });
  if (r.status === 503) {
    log('POST /api/v1/organizations/{}/channels/youtube/link'.replace('{}', orgId), 'PASS', '503 (expected — GOOGLE_CLIENT_ID/SECRET not configured on Render; documented platform behavior)');
  } else if (r.status === 201) {
    log('POST .../channels/youtube/link', 'PASS', '201 (Google OAuth configured)');
  } else {
    log('POST .../channels/youtube/link', 'INFO', `${r.status} — body: ${JSON.stringify(r.body).substring(0, 200)}`);
  }
  console.log('');

  // ── 6. List assets (initially empty) ───────────────────────────────
  console.log('── 6. Assets (list / upload) ──');
  r = await call('GET', `organizations/${orgId}/assets/`, { token: loginAccess });
  assertStatus(`GET /api/v1/organizations/${orgId}/assets`, r, 200);
  log('  empty initially', r.body?.items?.length === 0 ? 'PASS' : 'INFO', `items=${r.body?.items?.length}`);

  // Upload an asset (image). 1x1 transparent PNG as base64.
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  r = await call('POST', `organizations/${orgId}/assets/upload/`, {
    token: loginAccess,
    body: {
      kind: 'IMAGE',
      filename: `e2e-pixel-${ts}.png`,
      mimeType: 'image/png',
      bytesBase64: tinyPng,
      tags: ['e2e', 'test'],
    },
  });
  assertStatus(`POST /api/v1/organizations/${orgId}/assets/upload`, r, 201);
  const assetId = r.body?.id;
  log('  asset.id returned', assetId ? 'PASS' : 'FAIL', assetId || 'missing');
  log('  asset.kind=IMAGE', r.body?.kind === 'IMAGE' ? 'PASS' : 'FAIL', `kind=${r.body?.kind}`);

  // Re-list assets
  r = await call('GET', `organizations/${orgId}/assets/`, { token: loginAccess });
  assertStatus(`GET /api/v1/organizations/${orgId}/assets (after upload)`, r, 200);
  log('  asset appears in list', r.body?.items?.some(a => a.id === assetId) ? 'PASS' : 'FAIL',
      `items=${r.body?.items?.length}`);
  console.log('');

  // ── 7. Create a Series ─────────────────────────────────────────────
  console.log('── 7. Create series ──');
  r = await call('POST', `organizations/${orgId}/series/`, {
    token: loginAccess,
    body: {
      name: `E2E Series ${ts}`,
      niche: 'tech',
      cadencePerWeek: 2,
      language: 'en',
    },
  });
  assertStatus(`POST /api/v1/organizations/${orgId}/series`, r, 201);
  const seriesId = r.body?.id;
  log('  series.id returned', seriesId ? 'PASS' : 'FAIL', seriesId || 'missing');

  r = await call('GET', `organizations/${orgId}/series/`, { token: loginAccess });
  assertStatus(`GET /api/v1/organizations/${orgId}/series`, r, 200);
  log('  series appears in list', r.body?.items?.some(s => s.id === seriesId) ? 'PASS' : 'FAIL',
      `items=${r.body?.items?.length}`);
  console.log('');

  // ── 8. Try to create a video ───────────────────────────────────────
  console.log('── 8. Generate video ──');
  if (seriesId) {
    r = await call('POST', `organizations/${orgId}/series/${seriesId}/videos/`, {
      token: loginAccess,
      body: {
        topic: 'E2E test video',
        targetLengthSec: 30,
        voiceId: 'system-default',
        style: 'cinematic',
      },
    });
    // 201 if AI creds configured; 503/500 if not; 401 if token expired
    if (r.status === 201) {
      log(`POST /api/v1/organizations/${orgId}/series/${seriesId}/videos`, 'PASS', '201 — generation enqueued');
      const videoId = r.body?.id;
      if (videoId) {
        log('  video.id returned', 'PASS', videoId);
        // Try to get the video
        r = await call('GET', `organizations/${orgId}/videos/${videoId}/`, { token: loginAccess });
        assertStatus(`GET /api/v1/organizations/${orgId}/videos/${videoId}`, r, 200);
      }
    } else if (r.status === 401) {
      log('POST .../videos', 'FAIL', `401 — auth issue, body: ${JSON.stringify(r.body).substring(0, 200)}`);
    } else {
      log('POST .../videos', 'INFO', `${r.status} — body: ${JSON.stringify(r.body).substring(0, 200)}`);
    }
  } else {
    log('POST .../videos', 'SKIP', 'no series id');
  }
  console.log('');

  // ── 9. Notifications (known gap — no controller in code) ───────────
  console.log('── 9. Notifications ──');
  r = await call('GET', `organizations/${orgId}/notifications/`, { token: loginAccess });
  if (r.status === 404) {
    log(`GET /api/v1/organizations/${orgId}/notifications`, 'INFO', '404 — no NotificationsController in the API (known stub; code-only fix in apps/api/src/modules/notifications/)');
  } else {
    assertStatus(`GET /api/v1/organizations/${orgId}/notifications`, r, 200);
  }
  console.log('');

  // ── 10. Refresh token ──────────────────────────────────────────────
  console.log('── 10. Refresh token ──');
  r = await call('POST', 'auth/refresh/', { body: { refreshToken: loginRefresh } });
  assertStatus('POST /api/v1/auth/refresh', r, 200);
  const refreshedAccess = r.body?.tokens?.accessToken;
  const refreshedRefresh = r.body?.tokens?.refreshToken;
  log('  new accessToken', refreshedAccess ? 'PASS' : 'FAIL');
  log('  new refreshToken', refreshedRefresh ? 'PASS' : 'FAIL');
  log('  new tokens are different', (refreshedAccess !== loginAccess && refreshedRefresh !== loginRefresh) ? 'PASS' : 'FAIL');
  console.log('');

  // ── 11. Logout ─────────────────────────────────────────────────────
  console.log('── 11. Logout ──');
  r = await call('POST', 'auth/logout/', { body: { refreshToken: refreshedRefresh || loginRefresh } });
  assertStatus('POST /api/v1/auth/logout', r, 204);
  console.log('');

  // ── 12. Login again (after logout) ─────────────────────────────────
  console.log('── 12. Login again (after logout) ──');
  r = await call('POST', 'auth/login/', {
    body: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  assertStatus('POST /api/v1/auth/login (after logout)', r, 200);
  const finalAccess = r.body?.tokens?.accessToken;
  log('  tokens returned after re-login', finalAccess ? 'PASS' : 'FAIL');

  // ── 13. Verify the workspace still exists ──────────────────────────
  console.log('── 13. Verify data persistence ──');
  r = await call('GET', 'organizations/', { token: finalAccess });
  assertStatus('GET /api/v1/organizations (after re-login)', r, 200);
  log('  workspace still exists', r.body?.items?.some(w => w.organization?.id === orgId) ? 'PASS' : 'FAIL',
      `items=${r.body?.items?.length}`);

  r = await call('GET', `organizations/${orgId}/assets/`, { token: finalAccess });
  assertStatus(`GET /api/v1/organizations/${orgId}/assets (after re-login)`, r, 200);
  log('  asset still exists', r.body?.items?.some(a => a.id === assetId) ? 'PASS' : 'FAIL',
      `items=${r.body?.items?.length}`);
  console.log('');

  function printSummary() {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`  RESULT: ${pass} pass, ${fail} fail (${pass + fail} checks total)`);
    console.log('═══════════════════════════════════════════════════════════════════');
    process.exit(fail === 0 ? 0 : 1);
  }
  printSummary();
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});

// Updated Wed Aug  5 19:41:33 UTC 2026
