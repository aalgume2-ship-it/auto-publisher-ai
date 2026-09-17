#!/usr/bin/env node
/**
 * demo-campaign — end-to-end proof: login → series → 3× 20s videos → READY →
 * stream check. Runs entirely through the web proxy (http://127.0.0.1:4500)
 * so it exercises the exact path a real browser session uses.
 *
 * Idempotent: if the demo series already exists, it adopts its videos and only
 * creates the missing ones — safe to re-run after restarts.
 *
 * Usage: node infra/scripts/demo-campaign.mjs [baseUrl]
 * Env:   OWNER_ID / OWNER_PASSWORD (defaults are the env-seeded owner).
 */
const BASE = process.argv[2] ?? 'http://127.0.0.1:4500';
const EMAIL = process.env.OWNER_ID ?? '2558052235';
const PASSWORD = process.env.OWNER_PASSWORD ?? 'Lumen@Owner#2026!Riyadh';
const SERIES_NAME = 'عطر الصيف — حملة إعلانية';

const KEYWORDS = [
  'عطر الصيف الجديد: إحساس الانطلاق والحرية برائحة الحمضيات والياسمين',
  'سر الفخامة في كل قطرة: لماذا يختار الجميع عطرنا هذا الموسم',
  'عرض لفترة محدودة: اطلب عطر الصيف الآن واستمتع بخصم 30% قبل نفاد الكمية',
];

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { accept: 'application/json', ...(init?.headers ?? {}) } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

async function main() {
  log(`▶ demo campaign via ${BASE}`);

  // 1) login
  const login = await api('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (login.status !== 200 || !login.body?.tokens) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body).slice(0, 200)}`);
  const token = login.body.tokens.accessToken;
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  log('✓ login OK —', login.body.user.displayName);

  // 2) org
  const orgs = await api('/api/v1/organizations/', { headers: auth });
  const orgId = orgs.body.items?.[0]?.organization?.id;
  if (!orgId) throw new Error(`no org: ${JSON.stringify(orgs.body).slice(0, 200)}`);
  log('✓ org —', orgs.body.items[0].organization.name);

  // 3) find-or-create the demo series
  const seriesList = await api(`/api/v1/organizations/${orgId}/series/`, { headers: auth });
  const existing = (seriesList.body?.items ?? []).find((s) => s.name === SERIES_NAME);
  let seriesId = existing?.id;
  if (!seriesId) {
    const series = await api(`/api/v1/organizations/${orgId}/series`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: SERIES_NAME, niche: 'عطور وفخامة', cadencePerWeek: 3, language: 'ar' }),
    });
    if (series.status !== 201 && series.status !== 200) throw new Error(`series failed: ${series.status} ${JSON.stringify(series.body).slice(0, 300)}`);
    seriesId = series.body.id;
    log('✓ series created —', series.body.name, seriesId);
  } else {
    log('✓ series adopted —', SERIES_NAME, seriesId);
  }

  // 4) adopt existing videos, create the missing keywords
  const listResp = await api(`/api/v1/organizations/${orgId}/videos?seriesId=${seriesId}`, { headers: auth });
  let videos = (listResp.body?.items ?? []).filter((v) => v.seriesId === seriesId);
  log(`• existing videos in series: ${videos.length}`);
  for (const keyword of KEYWORDS) {
    if (videos.some((v) => v.keyword === keyword || v.title === keyword)) continue;
    const v = await api(`/api/v1/organizations/${orgId}/series/${seriesId}/videos`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ keyword, targetSeconds: 20 }),
    });
    if (v.status !== 201 && v.status !== 200) throw new Error(`video create failed: ${v.status} ${JSON.stringify(v.body).slice(0, 300)}`);
    const id = v.body?.video?.id ?? v.body?.id;
    videos.push({ id, keyword, status: v.body?.video?.status ?? 'QUEUED' });
    log(`✓ video queued — ${id}`);
  }
  if (videos.length === 0) throw new Error('no videos to process');

  // 5) poll until READY
  const deadline = Date.now() + 10 * 60 * 1000;
  const pending = () => new Set(videos.map((v) => v.id));
  while (pending().size > 0 && Date.now() < deadline) {
    await sleep(5000);
    const still = [];
    for (const id of pending()) {
      const r = await api(`/api/v1/organizations/${orgId}/videos/${id}`, { headers: auth });
      const status = r.body?.status;
      if (status === 'READY' || status === 'FAILED') {
        log(`• video ${id} → ${status}`);
        if (status === 'FAILED') throw new Error(`video ${id} FAILED: ${JSON.stringify(r.body).slice(0, 300)}`);
      } else {
        still.push(id);
      }
    }
    videos = videos.filter((v) => still.includes(v.id));
  }
  if (videos.length > 0) throw new Error(`timeout waiting for ${videos.length} video(s)`);

  // 6) stream check (Range → 206 video/mp4) on all three
  const finalList = (await api(`/api/v1/organizations/${orgId}/videos?seriesId=${seriesId}`, { headers: auth })).body?.items ?? [];
  for (const v of finalList.filter((v) => v.seriesId === seriesId)) {
    const res = await fetch(`${BASE}/api/v1/organizations/${orgId}/videos/${v.id}/stream`, {
      headers: { authorization: `Bearer ${token}`, range: 'bytes=0-1023' },
    });
    const ct = res.headers.get('content-type') ?? '';
    await res.arrayBuffer();
    log(`stream ${v.id}: HTTP ${res.status} ${ct} ${res.headers.get('content-range') ?? ''}`);
    if (res.status !== 206 || !ct.includes('video/')) throw new Error(`stream check failed for ${v.id}`);
  }

  log('★ ALL VIDEOS READY — demo campaign complete');
  log(`★ Open ${BASE}/campaigns and login with your account to view «عطر الصيف»`);
}

main().catch((e) => { console.error('✖', e.message); process.exit(1); });
