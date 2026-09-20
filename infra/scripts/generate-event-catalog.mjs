#!/usr/bin/env node
/**
 * generate-event-catalog.mjs — renders docs/Event-Catalog.md from the BUILT
 * @aca/shared dist (the machine-readable contract, ADR-024). The markdown is
 * an artifact: never hand-edited (CI `contracts-drift-check` regenerates and
 * diffs via --check).
 *
 * Usage:
 *   pnpm --filter @aca/shared build && node infra/scripts/generate-event-catalog.mjs
 *   node infra/scripts/generate-event-catalog.mjs --check   # drift => exit 1
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const distIndex = join(repoRoot, 'packages/shared/dist/index.js');
const target = join(repoRoot, 'docs/Event-Catalog.md');
const checkMode = process.argv.includes('--check');

if (!existsSync(distIndex)) {
  console.error('✖ packages/shared/dist missing — build @aca/shared first.');
  process.exit(1);
}

const shared = await import(distIndex);
const { EventCatalog, EventPayloadSchemas, EventNames, describeSchema, catalogFingerprint } = shared;

function fieldLine(name, d, required = true) {
  const opt = d.t === 'optional' ? '?' : '';
  const inner = d.t === 'optional' || d.t === 'nullable' || d.t === 'default' ? d.of : d;
  let ty = inner.t;
  if (inner.t === 'enum') ty = inner.values.map(String).join('\\|');
  if (inner.t === 'literal') ty = JSON.stringify(inner.v);
  if (inner.t === 'array') ty = `${fieldType(inner.of)}[]`;
  if (inner.t === 'union') ty = inner.options.map(fieldType).join('\\|');
  return { cell: `\`${name}${opt}\`: ${ty}` };
}
function fieldType(d) {
  if (!d) return 'unknown';
  if (d.t === 'enum') return d.values.map(String).join('\\|');
  if (d.t === 'array') return `${fieldType(d.of)}[]`;
  if (d.t === 'union') return d.options.map(fieldType).join('\\|');
  if (d.t === 'literal') return JSON.stringify(d.v);
  if (d.t === 'optional' || d.t === 'nullable' || d.t === 'default') return fieldType(d.of);
  return d.t;
}

const rows = Object.values(EventCatalog).map((e) => {
  const d = describeSchema(EventPayloadSchemas[e.name]);
  const fields =
    d.t === 'object' && d.fields
      ? Object.entries(d.fields)
          .map(([k, v]) => fieldLine(k, v).cell)
          .join(', ')
      : '—';
  return { ...e, fields };
});

const byDomain = new Map();
for (const r of rows) {
  const domain = r.name.split('.')[1];
  if (!byDomain.has(domain)) byDomain.set(domain, []);
  byDomain.get(domain).push(r);
}

const md = [];
md.push('# Event Catalog (generated — do not edit by hand)');
md.push('');
md.push(`**Source of truth:** \`packages/shared/src/contracts/event-catalog.ts\` (C1, frozen v1.1) ·`);
md.push(`**Generator:** \`infra/scripts/generate-event-catalog.mjs\` · **Fingerprint:** \`${catalogFingerprint()}\``);
md.push('');
md.push('Envelope fields: `id` (uuidv7) · `type` · `version` · `orgId` · `aggregateType/Id` · `occurredAt` · `traceId?` · `correlationId?` (= id at chain root) · `causationId?` · `producer?` · `metadata?` · `payload` (this document).');
md.push('');
md.push(`**Event types:** ${rows.length} · **Catalog ↔ EventNames parity:** ${EventNames.length === rows.length ? 'OK' : 'DRIFT'}`);
md.push('');
md.push('Consumers are the canonical fleet ids: orchestrator · autopilot · notifications · ws-bridge · webhooks-out · audit · analytics-projections · memory-writer · quota-guard · search-indexer · billing-projection.');
md.push('');

for (const [domain, list] of [...byDomain.entries()].sort()) {
  md.push(`## aca.${domain}.* (${list.length})`);
  md.push('');
  md.push('| Event | v | Producer | Consumers | Payload | Description |');
  md.push('|---|---|---|---|---|---|');
  for (const r of list) {
    md.push(
      `| \`${r.name}\` | ${r.version} | ${r.producer} | ${r.consumers.join(', ')} | ${r.fields} | ${r.description} |`,
    );
  }
  md.push('');
}

md.push('---');
md.push('');
md.push('**Versioning (C1):** payloads evolve additively only (new optional fields). Breaking change ⇒ new envelope `version` dual-emitted ≥ 6 months; never mutate v1. Contract changes require the `contract-change` label + linked ADR; the fingerprint above is asserted byte-for-byte by `packages/shared/test/event-catalog.spec.ts`.');
md.push('');

const content = md.join('\n');

if (checkMode) {
  const temp = join(mkdtempSync(join(tmpdir(), 'aca-catalog-')), 'Event-Catalog.md');
  writeFileSync(temp, content);
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    current = '';
  }
  const actual = readFileSync(temp, 'utf8');
  rmSync(dirname(temp), { recursive: true, force: true });
  if (current !== actual) {
    console.error('✗ event-catalog DRIFT: docs/Event-Catalog.md is stale vs @aca/shared contracts. Run infra/scripts/generate-event-catalog.mjs.');
    process.exit(1);
  }
  console.log('✓ event-catalog drift-check PASSED');
} else {
  writeFileSync(target, content);
  console.log(`✔ docs/Event-Catalog.md regenerated — ${rows.length} events, fingerprint ${catalogFingerprint()}`);
}
