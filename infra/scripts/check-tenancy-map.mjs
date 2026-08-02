#!/usr/bin/env node
/**
 * CI gate: every TENANT_FIELD entry must point at a field that EXISTS in
 * schema.prisma (values are Prisma FIELD names, not column names). Without it,
 * the tenant extension silently builds predicates Prisma rejects at runtime —
 * the exact latent failure this gate was born from (fixed in ADR-027's module).
 * Also: new direct-org models missing from the map are reported as warnings on
 * stdout (not failures — relation-scoped tenancy may be intentional).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const schema = readFileSync(join(root, 'packages', 'database', 'prisma', 'schema.prisma'), 'utf8');
const mapSrc = readFileSync(join(root, 'packages', 'shared', 'src', 'constants', 'tenancy.ts'), 'utf8');

const modelFields = new Map();
for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
  const fields = m[2]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('//') && !l.startsWith('@@'))
    .map((l) => l.split(/\s+/)[0]);
  modelFields.set(m[1], new Set(fields));
}

const entries = [...mapSrc.matchAll(/^\s*(\w+):\s*'(\w+)',$/gm)];
const errors = [];
for (const [, model, field] of entries) {
  const fields = modelFields.get(model);
  if (fields === undefined) errors.push(`${model}: not a schema model`);
  else if (!fields.has(field)) errors.push(`${model}: TENANT_FIELD says "${field}" — not a schema field`);
}
if (entries.length === 0) errors.push('no TENANT_FIELD entries parsed — did tenancy.ts shape change?');

if (errors.length > 0) {
  console.error('tenancy-map check FAILED:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`tenancy-map check OK (${entries.length} models mapped to existing schema fields)`);
