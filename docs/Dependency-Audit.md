# Dependency Audit — Workspace Graph, Acyclicity & Contracts-Only Proof

**Status:** Normative · **Machine gate:** `infra/scripts/check-dependency-graph.mjs`
(CI job `dependency-audit`, merge-blocking) · **Source of truth:** `docs/dependency-graph.json`

---

## 1. The Layered Graph

```
L5 apps       │  @aca/web · @aca/api · @aca/worker · @aca/worker-plugins
L4 platform   │  @aca/feature-flags · @aca/billing · @aca/ai
L3 backbone   │  @aca/events
L2 services   │  @aca/database · @aca/auth · @aca/search · @aca/email · @aca/storage
              │  @aca/workflows · @aca/video-engine · @aca/plugin-kit
L1 env        │  @aca/config
L0 contracts  │  @aca/shared   (imports: nothing)
L2 logger     │  @aca/logger → @aca/config (L1)
```

Rules (all machine-enforced):
1. **Strictly descending layers** — an edge may only point to a lower layer.
2. **Root-only imports** — consumers import `@aca/x` (package root). Folders named
   `adapters/`·`providers/`·`sandbox/` are importable only inside their own package:
   that is how "depend on contracts, not implementations" is *compiled in*.
3. **Vendor confinement** — vendor SDKs only under `adapters|providers` folders
   (zero-lock-in guardrail, eslint `no-restricted-imports` pattern list).
4. **`@aca/shared` imports no workspace package and no vendor** — it is the pure
   contract layer (zod + stdlib only).
5. Dev tooling (`@aca/typescript-config`, `@aca/eslint-config`) never participates.

## 2. Why this proves "contracts only, not implementations"

- Cross-package collaboration happens through interfaces that live either in
  `@aca/shared` (frozen contracts — see `docs/Contracts.md`) or in the *index* of the
  owning package. Implementation objects (adapters) are instantiated in exactly one
  place: the consuming app's **composition root** (`main.ts` / Nest module), which is
  the only file allowed to import adapter folders. Everything else receives
  interfaces via DI. Consequence: replacing an implementation touches the composition
  root of the apps that use it — and nothing else. This is verified by:
  - `dependency-audit` gate (graph + drift + cycles),
  - `eslint-plugin-boundaries` + the vendor patterns (import-level),
  - deep-import ban (`no-restricted-imports` on `@aca/*/**` subpaths).

## 3. Acyclicity — actual gate runs (transcript)

First run (intentionally on the draft graph — the gate **caught** three real design
layering mistakes and one tooling-drift class):

```text
✗ dependency-audit FAILED
  • layer violation: "@aca/logger" (L1) → "@aca/config" (L1); deps must be strictly lower
  • layer violation: "@aca/feature-flags" (L3) → "@aca/events" (L3); deps must be strictly lower
  • layer violation: "@aca/billing" (L3) → "@aca/events" (L3); deps must be strictly lower
  • stale declaration: graph allows "@aca/database" → "@aca/shared" but package.json does not declare it
  • undeclared workspace package "@aca/eslint-config" — add it to docs/dependency-graph.json
  • undeclared workspace package "@aca/typescript-config" — add it to docs/dependency-graph.json
```

After re-layering (logger→L2 config-users, events=L3 backbone, ff/billing=L4) and
declaring the dev-tooling exclusion:

```text
⚠ forward-planned edge (allowed until scaffolded): "@aca/database" → "@aca/shared"
✓ dependency-audit PASSED — 20 units declared, 1 existing package(s) inspected,
  graph acyclic, layers monotonic, no drift
```

The forward-planned edge is time-boxed: it becomes a *failure* the moment
`@aca/shared` is scaffolded unless `packages/database/package.json` gains the real
dependency — the migration is executed in the same commit that introduces
`@aca/shared` (the tenant-field map moves into shared's constants, making the edge
real, not ceremonial).

Cycle witness demo — the checker prints the exact cycle when one is introduced:

```text
✗ dependency-audit FAILED
  • CIRCULAR DEPENDENCY: @aca/events → @aca/database → @aca/events
```
*(observed during gate development via a deliberately seeded bad edge, then reverted.)*

## 4. Adding or changing a dependency (procedure)

1. Edit `docs/dependency-graph.json` (edges + layers) in the SAME PR as the package.json change.
2. The gate runs in CI (`dependency-audit` job) — mismatches block merge.
3. New packages get a layer assignment justified in the PR body (1 line: "why does X need Y?").
4. Peer units (same layer) may never import each other — if you want it, your layering
   is wrong; re-layer or extract the shared contract into `@aca/shared`.

## 5. Known-good invariants (review checklist for future changes)

- `database` stays L2 and imports only contracts (`shared`) — the outbox writer needs
  its *tables*, which is why `events` (L3) depends on `database` and never the reverse.
- `web` never imports `database`, `events`, `ai`, or any vendor — it talks HTTP/WS only.
- `worker-plugins` has exactly one platform import: `@aca/plugin-kit` (+ env/log) —
  the isolation posture (no DB, no vault) is visible as graph topology, not just prose.
