#!/usr/bin/env node
/**
 * offline-prisma — makes Prisma 6.16 work without binaries.prisma.sh.
 *
 * 1) Extracts the vendored WASM engine packages (@prisma/schema-engine-wasm,
 *    @prisma/prisma-schema-wasm) as siblings of the installed prisma CLI in
 *    node_modules/.pnpm/... — the CLI declares them as dependencies of its
 *    bundled internals and uses them when running `db push` through the
 *    driver adapter defined in packages/database/prisma.config.ts.
 *
 * 2) Patches @prisma/adapter-pg: pg's ScalarColumnType enum has no entry for
 *    the catalog types `name` (OID 19) / `"char"` (OID 18) or the oid-family
 *    OIDs that the schema engine's introspection queries return, which made
 *    `db push` die with "Column type 'name' could not be deserialized from
 *    the database" (prisma/prisma#27403). Idempotent.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vendor = join(root, 'infra', 'vendor', 'wasm');
const pnpmDir = join(root, 'node_modules', '.pnpm');

// ── 1) find the installed prisma CLI dir ────────────────────────────────────
const cliEntry = execSync('node -p "require.resolve(\'prisma/package.json\', { paths: [process.cwd()] })"', { cwd: root, encoding: 'utf8' }).trim();
if (!cliEntry || !existsSync(cliEntry)) throw new Error('prisma CLI not installed — run pnpm install first');
const cliDir = dirname(dirname(cliEntry)); // .../node_modules/.pnpm/prisma@6.16.2_*/node_modules/prisma
console.log('▸ prisma CLI:', cliDir.replace(root + '/', ''));

// ── 2) extract vendored wasm packages as CLI siblings ───────────────────────
const siblings = join(dirname(cliDir), '@prisma'); // .../node_modules/@prisma
for (const [tgz, dir] of [
  ['schema-engine-wasm-6.16.0-7.tgz', 'schema-engine-wasm'],
  ['prisma-schema-wasm-6.16.0-7.tgz', 'prisma-schema-wasm'],
]) {
  const dest = join(siblings, dir);
  if (existsSync(join(dest, 'package.json'))) {
    console.log(`▸ ${dir} already present`);
    continue;
  }
  mkdirSync(dest, { recursive: true });
  execSync(`tar xzf ${JSON.stringify(join(vendor, tgz))} -C ${JSON.stringify(dest)} --strip-components=1`);
  console.log(`▸ extracted ${dir} from vendor`);
}

// ── 3) patch @prisma/adapter-pg (catalog type OIDs) ─────────────────────────
const pgEntry = execSync('node -p "require.resolve(\'@prisma/adapter-pg/package.json\', { paths: [process.cwd()] })"', { cwd: root, encoding: 'utf8' }).trim();
const pgDir = dirname(pgEntry);
let patched = 0;
for (const f of ['dist/index.js', 'dist/index.mjs']) {
  const p = join(pgDir, f);
  if (!existsSync(p)) continue;
  let s = readFileSync(p, 'utf8');
  const before = s;
  // string types: "char" (18), name (19)
  if (!s.includes('case 18:')) {
    s = s.replace('    case ScalarColumnType.BPCHAR:', '    case 18:\n    case 19:\n    case ScalarColumnType.BPCHAR:');
  }
  // oid-family integer types: regproc 24, oid 26, tid 27, xid 28, cid 29,
  // regclass 2205, regtype 2206, regnamespace 4089, regrole 4096
  if (!s.includes('case 2205:')) {
    s = s.replace(
      '    case ScalarColumnType.OID:\n      return ColumnTypeEnum.Int64;',
      '    case ScalarColumnType.OID:\n    case 24:\n    case 26:\n    case 27:\n    case 28:\n    case 29:\n    case 2205:\n    case 2206:\n    case 4089:\n    case 4096:\n      return ColumnTypeEnum.Int64;',
    );
  }
  if (s !== before) {
    writeFileSync(p, s);
    patched++;
    console.log(`▸ patched ${f} (catalog type OIDs)`);
  }
}
if (patched === 0) console.log('▸ adapter-pg already patched');
console.log('✓ offline-prisma ready');
