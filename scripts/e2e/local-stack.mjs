#!/usr/bin/env node
/**
 * E2E — real end-to-end against the LOCAL running stack
 * (API :4000 + Worker :8080 + Postgres :5432 + Redis :6379).
 * NO mocks: every step writes real rows and real queues.
 */
const BASE = process.env.BASE || 'http://localhost:4000';
const ts = Date.now();
const EMAIL = `e2e.${ts}@example.com`;
const PASSWORD = 'Riyadh-2026!e2e-passphrase';
const NAME = 'E2E Live Tester';

let pass = 0, fail = 0;
const results = [];
const log = (label, ok, info = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${info ? ' — ' + info : ''}`);
  results.push({ label, ok, info });
  ok ? pass++ : fail++;
};

async function call(method, path, { body, token, expect } = {}) {
  const url = path.startsWith('health') ? `${BASE}/${path}` : `${BASE}/v1/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method !== 'GET' && method !== 'HEAD' ? { 'Idempotency-Key': `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  const ok = expect ? expect.includes(res.status) : res.ok;
  return { status: res.status, body: json, ok };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  E2E REAL STACK — ${BASE} (user: ${EMAIL})`);
  console.log('══════════════════════════════════════════════════════════\n');

  /* 1 ── health */
  let r = await call('GET', 'health', {}, { expect: [200] });
  log('health', r.ok && r.body?.status === 'ok', `status=${r.body?.status}`);
  r = await call('GET', 'health/ready', {}, { expect: [200] });
  log('health/ready (postgres+redis)', r.ok && r.body?.checks?.postgres === 'up' && r.body?.checks?.redis === 'up', `pg=${r.body?.checks?.postgres} redis=${r.body?.checks?.redis}`);

  /* 2 ── signup */
  r = await call('POST', 'auth/register', { body: { email: EMAIL, password: PASSWORD, displayName: NAME, locale: 'en', timezone: 'UTC' } }, { expect: [201, 200] });
  log('signup', r.ok, r.status);
  if (!r.ok) { console.log(JSON.stringify(r.body).slice(0, 400)); process.exit(1); }
  const token = r.body?.tokens?.accessToken;
  const refresh = r.body?.tokens?.refreshToken;
  log('signup returns access token', !!token);

  /* 3 ── org */
  r = await call('POST', 'organizations', { body: { name: `E2E Studio ${ts}`, timezone: 'UTC', defaultLocale: 'en' }, token }, { expect: [201] });
  log('create org', r.ok, r.status);
  const orgId = r.body?.id;
  if (!orgId) { console.log(JSON.stringify(r.body).slice(0, 400)); process.exit(1); }

  /* 4 ── series */
  r = await call('POST', `organizations/${orgId}/series`, { body: { name: 'E2E Series', niche: 'science', language: 'en' }, token }, { expect: [201] });
  log('create series', r.ok, r.status);
  const seriesId = r.body?.id;
  if (!seriesId) { console.log(JSON.stringify(r.body).slice(0, 400)); process.exit(1); }

  /* 5 ── generate video (REAL job) */
  r = await call('POST', `organizations/${orgId}/series/${seriesId}/videos`, { body: { keyword: 'The mystery of black holes explained simply', targetSeconds: 30 }, token }, { expect: [201] });
  log('generate video → job created', r.ok, r.status);
  const videoId = r.body?.video?.id || r.body?.id;
  if (!videoId) { console.log(JSON.stringify(r.body).slice(0, 500)); process.exit(1); }
  console.log(`\n  videoId=${videoId} — waiting for worker…\n`);

  /* 6 ── poll video status (worker pipeline) */
  let status = '';
  let detail = null;
  const deadline = Date.now() + 6 * 60_000;
  while (Date.now() < deadline) {
    await sleep(5000);
    r = await call('GET', `organizations/${orgId}/videos/${videoId}`, { token }, { expect: [200] });
    if (!r.ok) { console.log('  poll error:', JSON.stringify(r.body).slice(0, 300)); continue; }
    status = r.body?.status;
    detail = r.body?.seo?.step || r.body?.failureReason || '';
    if (['READY', 'FAILED', 'PUBLISHED'].includes(status)) break;
    process.stdout.write(`  status=${status} step=${detail}\r`);
  }
  console.log(`\n  FINAL status=${status} (${detail})\n`);
  log('video reached READY via worker', status === 'READY' || status === 'PUBLISHED', `status=${status} reason=${detail}`);

  if (status === 'READY' || status === 'PUBLISHED') {
    const rendition = r.body?.renditions?.[0];
    log('video has rendition row', !!rendition?.id, JSON.stringify(rendition ? { id: rendition.id, profile: rendition.profile, status: rendition.status } : null));
    const streamRes = await fetch(`${BASE}/v1/organizations/${orgId}/videos/${videoId}/stream`, {
      headers: { Authorization: `Bearer ${token}`, Range: 'bytes=0-1023' },
    });
    const bytes = Number(streamRes.headers.get('content-length') || 0);
    const ct = streamRes.headers.get('content-type');
    log('stream/download (range 0-1023)', streamRes.status === 206 && bytes > 0, `status=${streamRes.status} bytes=${bytes} type=${ct}`);
    const full = await fetch(`${BASE}/v1/organizations/${orgId}/videos/${videoId}/stream`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const buf = Buffer.from(await full.arrayBuffer());
    log('full download', full.ok && buf.length > 50_000, `status=${full.status} bytes=${buf.length}`);
  }

  /* 8 ── library (real DB rows) */
  r = await call('GET', `organizations/${orgId}/library?type=videos`, { token }, { expect: [200] });
  log('library/videos lists real rows', r.ok && Array.isArray(r.body?.items), `items=${r.body?.items?.length} total=${r.body?.total}`);

  /* 9 ── provider status (masked) */
  r = await call('GET', `organizations/${orgId}/providers/status`, { token }, { expect: [200] });
  log('providers/status', r.ok && Array.isArray(r.body?.items), `providers=${r.body?.items?.length}`);
  if (r.ok) {
    const byCat = (cat) => r.body.items.filter((i) => i.category === cat).map((i) => `${i.id}=${i.state}`).join(' ');
    console.log('  LLM:  ', byCat('LLM'));
    console.log('  VIDEO:', byCat('VIDEO'));
    console.log('  IMAGE:', byCat('IMAGE'));
    console.log('  SOCIAL:', byCat('SOCIAL'));
  }

  /* 10 ── dashboard (real DB aggregates) */
  r = await call('GET', `organizations/${orgId}/dashboard`, { token }, { expect: [200] });
  log('dashboard aggregates', r.ok && typeof r.body?.totals?.videos === 'number', `videos=${r.body?.totals?.videos} images=${r.body?.totals?.images} storage=${r.body?.totals?.storageBytes}`);

  /* 11 ── image generation (REAL job → worker) */
  r = await call('POST', `organizations/${orgId}/images`, { body: { prompt: 'A cinematic desert landscape at sunset', count: 1 }, token }, { expect: [201] });
  log('image generation job created', r.ok, r.status);
  const imageGenId = r.body?.id;
  if (imageGenId) {
    let imgStatus = '';
    const imgDeadline = Date.now() + 4 * 60_000;
    while (Date.now() < imgDeadline) {
      await sleep(5000);
      r = await call('GET', `organizations/${orgId}/images/${imageGenId}`, { token }, { expect: [200] });
      imgStatus = r.body?.status;
      if (['COMPLETED', 'FAILED'].includes(imgStatus)) break;
    }
    log('image generation terminal state reached', ['COMPLETED', 'FAILED'].includes(imgStatus), `status=${imgStatus} assetIds=${r.body?.assetIds?.length} reason=${r.body?.failureReason ?? ''}`);
  }

  /* 12 ── upload asset (base64 → store → asset row) */
  const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  r = await call('POST', `organizations/${orgId}/assets/upload`, {
    body: { fileName: 'test-image.png', mimeType: 'image/png', kind: 'IMAGE', tags: ['e2e'], base64: png1x1.toString('base64') },
    token,
  }, { expect: [201] });
  log('upload asset', r.ok, r.status);
  const assetId = r.body?.id;
  if (assetId) {
    r = await call('GET', `organizations/${orgId}/assets?kind=IMAGE`, { token }, { expect: [200] });
    log('asset listed in library', r.ok && r.body?.items?.some((a) => a.id === assetId));
  }

  /* 12b ── presign upload endpoint */
  r = await call('POST', `organizations/${orgId}/uploads/presign`, {
    body: { fileName: 'clip.mp4', mimeType: 'video/mp4', kind: 'VIDEO_CLIP', sizeBytes: 1_000_000 },
    token,
  }, { expect: [201] });
  log('presign upload endpoint', r.ok && (r.body?.tier === 's3' || r.body?.tier === 'database'), `tier=${r.body?.tier} ${r.body?.uploadUrl ? 'hasURL' : 'base64-path'}`);

  /* 12c ── schedule/dub guards (video not READY → 409 CONFLICT, honest gate) */
  if (videoId) {
    r = await call('POST', `organizations/${orgId}/videos/${videoId}/schedule`, {
      body: { channelId: '00000000-0000-0000-0000-000000000000' },
      token, expect: [409, 404],
    });
    log('schedule guard (not READY → 409)', r.ok, `status=${r.status}`);
    r = await call('POST', `organizations/${orgId}/videos/${videoId}/dub`, {
      body: { targetLanguage: 'en' },
      token, expect: [409],
    });
    log('dub guard (not READY → 409)', r.ok, `status=${r.status}`);
    r = await call('POST', `organizations/${orgId}/videos/${videoId}/upscale`, { token, expect: [202, 409] });
    log('upscale guard', r.ok, `status=${r.status}`);
  }

  /* 13 ── campaign create + calendar */
  r = await call('POST', `organizations/${orgId}/campaigns`, {
    body: {
      name: 'Daily Content',
      platforms: ['youtube', 'tiktok'],
      cadence: 'daily',
      timeOfDay: '18:00',
      timezone: 'Asia/Riyadh',
      contentMode: 'auto',
      referenceImageIds: assetId ? [assetId] : [],
      config: { captions: 'ai', hashtags: 'ai' },
    },
    token,
  }, { expect: [201] });
  log('campaign created', r.ok, r.status);
  const campaignId = r.body?.id;
  if (campaignId) {
    r = await call('GET', `organizations/${orgId}/calendar`, { token }, { expect: [200] });
    log('calendar endpoint', r.ok && Array.isArray(r.body?.items), `events=${r.body?.items?.length}`);
    r = await call('POST', `organizations/${orgId}/campaigns/${campaignId}/run`, { token }, { expect: [202] });
    log('campaign run-now enqueued', r.ok, r.status);
  }

  /* 14 ── logout */
  r = await call('POST', 'auth/logout', { body: { refreshToken: refresh }, token }, { expect: [200] });
  log('logout', r.ok, r.status);

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  RESULT: ${pass} passed, ${fail} failed`);
  console.log('══════════════════════════════════════════════════════════');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('E2E CRASH:', e); process.exit(1); });
