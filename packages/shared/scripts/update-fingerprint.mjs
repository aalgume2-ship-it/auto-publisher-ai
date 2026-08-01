#!/usr/bin/env node
/**
 * Regenerates test/event-catalog.fingerprint.json from the BUILT dist.
 * Policy (docs/Contracts.md): run ONLY on PRs that carry the `contract-change`
 * label and link an ADR — the drift this produces is the visible contract diff.
 * Requires: pnpm --filter @aca/shared build (this script refuses stale/missing dist).
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = join(pkgRoot, 'dist', 'index.js');

if (!existsSync(distIndex)) {
  console.error('✖ dist/index.js missing — run "pnpm --filter @aca/shared build" first.');
  process.exit(1);
}

const { catalogManifest, catalogFingerprint } = await import(distIndex);

const out = {
  _note:
    'CI contract fingerprint — regenerate ONLY with the contract-change label + ADR (docs/Contracts.md governance). Command: pnpm --filter @aca/shared run fingerprint:update',
  catalog: catalogFingerprint(),
  events: catalogManifest(),
};

const target = join(pkgRoot, 'test', 'event-catalog.fingerprint.json');
writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`✔ fingerprint regenerated: ${Object.keys(out.events).length} events, catalog=${out.catalog}`);
