#!/usr/bin/env node
/**
 * check-dependency-graph.mjs — CI gate "dependency-audit".
 *
 * Proofs, against the REAL workspace state:
 *   1. The declared graph (docs/dependency-graph.json) is acyclic (DFS, exact witness printed on failure).
 *   2. Layer monotonicity — every declared edge points to a strictly lower layer.
 *   3. Drift detection — for every package that EXISTS in the repo, its @aca/* dependencies in
 *      package.json must equal the declared set exactly (no undeclared imports, no stale entries).
 *
 * Zero-dependency Node ESM so the gate works before `pnpm install` (PR full build later
 * re-verifies real imports via eslint boundaries).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const graph = JSON.parse(readFileSync(join(repoRoot, 'docs/dependency-graph.json'), 'utf8'));

const errors = [];
const layers = graph.layers;
const edges = graph.edges;

// ── (2) layer monotonicity ──────────────────────────────────────────────────
for (const [pkg, deps] of Object.entries(edges)) {
  if (!(pkg in layers)) errors.push(`edge source "${pkg}" missing from layers`);
  for (const dep of deps) {
    if (!(dep in layers)) errors.push(`"${pkg}" depends on unknown layer package "${dep}"`);
    else if (layers[dep] >= layers[pkg])
      errors.push(`layer violation: "${pkg}" (L${layers[pkg]}) → "${dep}" (L${layers[dep]}); deps must be strictly lower`);
  }
}

// ── (1) acyclicity with witness path ───────────────────────────────────────
const WHITE = 0, GRAY = 1, BLACK = 2;
const color = new Map(Object.keys(edges).map((n) => [n, WHITE]));
const stack = [];
let cycleWitness = null;
function dfs(node) {
  if (cycleWitness) return;
  color.set(node, GRAY);
  stack.push(node);
  for (const dep of edges[node] ?? []) {
    if (!edges[dep]) continue; // not a graph node (shouldn't happen — caught above)
    if (color.get(dep) === GRAY) {
      cycleWitness = [...stack.slice(stack.indexOf(dep)), dep];
      return;
    }
    if (color.get(dep) === WHITE) dfs(dep);
    if (cycleWitness) return;
  }
  stack.pop();
  color.set(node, BLACK);
}
for (const node of Object.keys(edges)) if (color.get(node) === WHITE) dfs(node);
if (cycleWitness) errors.push(`CIRCULAR DEPENDENCY: ${cycleWitness.join(' → ')}`);

// ── (3) drift vs actual workspace package.json files ───────────────────────
const dirs = ['apps', 'packages'];
const devOnlyTooling = graph.devOnlyTooling ?? [];
let inspected = 0;
const warnings = [];
for (const dir of dirs) {
  const base = join(repoRoot, dir);
  if (!existsSync(base)) continue;
  for (const name of readdirSync(base)) {
    const pkgJsonPath = join(base, name, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    const pkgName = pkg.name;
    if (devOnlyTooling.includes(pkgName)) continue; // dev tooling never participates in the app graph
    inspected += 1;
    const declared = new Set(edges[pkgName] ?? []);
    const actual = new Set(
      Object.keys({
        ...(pkg.dependencies ?? {}),
        ...(pkg.peerDependencies ?? {}),
      }).filter((d) => d.startsWith('@aca/')),
    );
    if (!edges[pkgName]) {
      errors.push(`undeclared workspace package "${pkgName}" — add it to docs/dependency-graph.json`);
      continue;
    }
    for (const a of actual)
      if (!devOnlyTooling.includes(a) && !declared.has(a))
        errors.push(`undeclared edge: "${pkgName}" depends on "${a}" but docs/dependency-graph.json does not allow it`);
    for (const d of declared) {
      if (actual.has(d)) continue;
      const short = d.replace('@aca/', '');
      const targetExists = existsSync(join(repoRoot, 'packages', short, 'package.json')) || existsSync(join(repoRoot, 'apps', short, 'package.json'));
      // Forward-planning is allowed ONLY while the dependency package hasn't been
      // scaffolded yet; once it exists the importer MUST declare the real dependency.
      if (targetExists) errors.push(`stale declaration: graph allows "${pkgName}" → "${d}" but package.json does not declare it`);
      else warnings.push(`forward-planned edge (allowed until scaffolded): "${pkgName}" → "${d}"`);
    }
  }
}

for (const w of warnings) console.warn('  ⚠', w);

if (errors.length) {
  console.error('✗ dependency-audit FAILED');
  for (const e of errors) console.error('  •', e);
  process.exit(1);
}
console.log(
  `✓ dependency-audit PASSED — ${Object.keys(edges).length} units declared, ` +
    `${inspected} existing package(s) inspected, graph acyclic, layers monotonic, no drift`,
);
