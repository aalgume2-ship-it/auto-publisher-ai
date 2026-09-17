#!/usr/bin/env node
/**
 * import-footage — uploads the offline footage clips (rendered by
 * gen-footage.sh) into the org's local media library through the running
 * web proxy, exactly like a browser would. Idempotent: existing files are
 * skipped.
 *
 * Usage: node infra/scripts/import-footage.mjs [baseUrl]
 * Env:   OWNER_ID / OWNER_PASSWORD
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4500';
const EMAIL = process.env.OWNER_ID ?? '2558052235';
const PASSWORD = process.env.OWNER_PASSWORD ?? 'Lumen@Owner#2026!Riyadh';

const TAGS = {
  'perfume-gold.mp4': 'perfume,fragrance,gold,luxury,elegant,warm,abstract',
  'summer-waves.mp4': 'summer,sunny,bright,warm,fresh,abstract',
  'smoke-oud.mp4': 'incense,smoke,oud,perfume,fragrance,mystery,abstract',
  'sparkle-bokeh.mp4': 'sparkle,shine,glow,luxury,beauty,perfume,elegant',
  'flower-bloom.mp4': 'flowers,garden,nature,beauty,spring,fresh',
  'water-ripple.mp4': 'water,waves,ocean,fresh,calm,abstract',
  'night-city.mp4': 'night,city,lights,urban,abstract',
  'space-galaxy.mp4': 'space,galaxy,universe,stars,abstract',
};

const root = join(import.meta.dirname, '..', '..');
const dir = join(root, '.data', 'footage-gen');

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then((r) => r.json());
const token = login?.tokens?.accessToken;
if (!token) throw new Error('login failed');

const orgs = await fetch(`${BASE}/api/v1/organizations/`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
const orgId = orgs?.items?.[0]?.organization?.id;
if (!orgId) throw new Error('no organization found');

const status = await fetch(`${BASE}/api/v1/organizations/${orgId}/local-media/`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
const have = new Set((status?.footage ?? []).map((f) => f.file));

for (const file of readdirSync(dir).filter((f) => f.endsWith('.mp4'))) {
  if (have.has(file)) { console.log(`  ✓ ${file} (already imported)`); continue; }
  const tags = TAGS[file] ?? 'abstract';
  const res = await fetch(`${BASE}/api/v1/organizations/${orgId}/local-media/footage?fileName=${encodeURIComponent(file)}&tags=${encodeURIComponent(tags)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
    body: readFileSync(join(dir, file)),
  });
  const body = await res.text();
  console.log(`  ${res.status === 201 || res.status === 200 ? '✓' : '✖'} ${file} → HTTP ${res.status} ${body.slice(0, 120)}`);
  if (res.status !== 201 && res.status !== 200) process.exitCode = 1;
}
console.log('✓ footage import done');
