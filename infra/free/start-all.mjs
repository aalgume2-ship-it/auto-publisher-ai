#!/usr/bin/env node
/**
 * start-all — free-tier supervisor: runs the API ($PORT, assigned by Render)
 * and the worker (:4300) in ONE container, keeps them alive, and performs the
 * idempotent boot routine:
 *
 *   1. prisma db push   (schema → Neon; WASM engines, no native binaries)
 *   2. API + worker     (children, restarted on crash)
 *   3. footage library  (deterministic lavfi clips, regenerated each boot —
 *                        container disks are ephemeral on the free tier)
 *   4. demo campaign    (adopts READY videos already in the database)
 *
 * Env: DATABASE_URL, REDIS_URL required. AUTH_JWT_SECRET optional (a random
 * one is generated per boot — users just log in again after a restart).
 * EXCLUSIVE_ADMIN_PASSWORD seeds the owner account.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const log = (...a) => console.log(`[start-all ${new Date().toISOString().slice(11, 19)}]`, ...a);

const PORT = process.env.PORT || '10000';
const WORKER_PORT = process.env.WORKER_PORT || '4300';

if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
  console.error('✖ DATABASE_URL and REDIS_URL are required (Render env vars)');
  process.exit(1);
}
if (!process.env.AUTH_JWT_SECRET || process.env.AUTH_JWT_SECRET.length < 32) {
  process.env.AUTH_JWT_SECRET = randomBytes(32).toString('hex');
  log('⚠ AUTH_JWT_SECRET not set — generated a random one for this boot (sessions reset on restart)');
}

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
};

// ── 1) schema ────────────────────────────────────────────────────────────────
log('▸ prisma db push (schema → database)');
run('npx', ['prisma', 'db', 'push', '--skip-generate'], { cwd: join(root, 'packages', 'database') });

// ── 2) children ──────────────────────────────────────────────────────────────
const children = new Map();
function startChild(name, args, env) {
  const child = spawn('node', args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  children.set(name, child);
  log(`▸ ${name} started (pid ${child.pid})`);
  child.on('exit', (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;
    log(`⚠ ${name} exited (${code ?? signal}) — restarting in 5s`);
    setTimeout(() => startChild(name, args, env), 5000);
  });
}

let shuttingDown = false;
startChild('api', ['apps/api/dist/main.js'], { PORT });
startChild('worker', ['apps/worker/dist/main.js'], { PORT: WORKER_PORT });

process.on('SIGTERM', () => {
  shuttingDown = true;
  log('▸ SIGTERM — stopping children');
  for (const child of children.values()) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 4000);
});

// ── 3+4) wait for API health, then footage + demo campaign ─────────────────
const base = `http://127.0.0.1:${PORT}`;
async function waitForApi() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${base}/health/ready`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

(async () => {
  if (!(await waitForApi())) {
    log('⚠ API did not become healthy — skipping boot regeneration (children keep running)');
    return;
  }
  log('▸ API healthy — regenerating footage library');
  try {
    run('bash', ['infra/scripts/gen-footage.sh']);
    run('node', ['infra/scripts/import-footage.mjs', base]);
  } catch (e) {
    log('⚠ footage regeneration failed (continuing):', e.message);
  }
  log('▸ regenerating demo campaign (idempotent, adopts READY videos)');
  try {
    run('node', ['infra/scripts/demo-campaign.mjs', base]);
  } catch (e) {
    log('⚠ demo campaign regeneration failed (continuing):', e.message);
  }
  log('✓ boot routine complete — services running');
})();
