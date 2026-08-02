#!/usr/bin/env node
/**
 * run-api — boots apps/api for local development with the repo-root
 * .env.local (gitignored; written by `pnpm dev:bootstrap`).
 *
 * Why a wrapper: Node's --env-file expects ONE path resolved from the CWD
 * (which differs between `pnpm dev:api` at the root and --filter runs), and
 * `apps/api start` must stay production-pure (env only, no files). This
 * runner pins the file to the repo root regardless of where it is invoked
 * from, preflights the common mistakes with actionable messages, then hands
 * control to the real bootstrap unchanged.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const entry = resolve(root, 'apps/api/dist/main.js');

try {
  process.loadEnvFile(resolve(root, '.env.local'));
} catch {
  console.warn('▸ .env.local not found — relying on exported environment (fine for CI/prod-like runs).');
}

if (!existsSync(entry)) {
  console.error('✖ apps/api is not built (apps/api/dist/main.js missing). Run `pnpm build` first.');
  process.exit(1);
}
for (const key of ['DATABASE_URL', 'REDIS_URL']) {
  if (process.env[key] === undefined || process.env[key] === '') {
    console.error(`✖ ${key} is not set. Run \`pnpm dev:bootstrap\` (it writes .env.local) or export it.`);
    process.exit(1);
  }
}
if ((process.env.AUTH_JWT_SECRET ?? '').length < 32) {
  console.error('✖ AUTH_JWT_SECRET missing/too short. Run `pnpm dev:bootstrap` (it writes a dev value into .env.local).');
  process.exit(1);
}

const port = process.env.PORT ?? '3000';
console.log(`▸ AutoCreator AI API → http://localhost:${port}`);
console.log(`▸ Swagger UI        → http://localhost:${port}/docs   (spec: /openapi.json)`);
console.log(`▸ Health            → http://localhost:${port}/health (live: /health/live, ready: /health/ready)`);
console.log(`▸ Metrics           → http://localhost:${port}/metrics`);

await import(entry);
