# Engineering Standards — Definition of Done & CI Quality Gates

**Applies to:** every PR. No role-based exceptions; the owner of `main` is the gate,
not a person.

---

## 1. Definition of Done (per feature)

A feature is DONE when ALL boxes are true (the PR template renders this list;
unchecked items require a linked follow-up **and** tech-lead waiver comment):

1. **Design traceability** — if behavior/contract changed: ADR updated/added; affected
   docs touched in the same PR (docs live with code, drift is a bug).
2. **Contracts** — public contract changes pass `contracts-drift-check`; events added
   to the typed catalog; new agent kinds registered in `@aca/shared/agent-kinds`.
3. **Tests** — all suites green; **diff coverage ≥ 80%**; new failure modes have
   regression tests; money/tenancy/executor changes include their 100%-gate suites.
4. **Static health** — zero new `high`+ findings (eslint, tsc strict, CodeQL,
   Trivy, gitleaks, osv-scanner); zero new `any`-leaks in strict TS (enforced by
   `no-unsafe-*` rules on changed files).
5. **DB changes** — Prisma validate + migrate-diff clean; destructive changes are
   expand-and-contract (2 releases); partitions/RLS notes added when touching
   partitioned/RLS tables; seed updated if domain seeds are affected.
6. **Performance budget** — hot-path changes (API ≥ 100 RPS paths, executor, agents,
   render) attach **evidence**: benchmark snippet output or k6 line in the PR body;
   new queries carry `EXPLAIN` for their worst listed plan in PR description (one
   screenshot block), new indexes created `CONCURRENTLY`.
7. **Observability added, not hoped-for** — new operations emit: a metric (named per
   conventions: `aca_<area>_<noun>_<verb>`), structured log fields (`orgId`, `runId`,
   `traceId` where relevant), and a span when crossing process/queue boundaries;
   dashboards updated when an SLO-covered path changes; **alert only on symptoms that
   page a human** (otherwise dashboard-only — alert-fatigue rule).
8. **Failure behavior** — the feature's failure modes are enumerated in its module
   README section (provider down, timeout, poisoned input) with retry/idempotency
   story consistent with Failover-Plan; new external calls declare timeouts.
9. **Security checklist** — tenant scope asserted by a test when touching
   org-scoped data; audit event for money/security-relevant mutations; no secrets /
   tokens / customer media URLs in logs (redaction paths extended if new shape);
   flags guard new user-visible capabilities (default off in prod).
10. **UX completeness (web)** — en+ar strings parity; RTL verified on affected views
    (screenshot in PR); keyboard nav + axe clean on changed pages; loading/empty/error
    states rendered (no silent spinners of doom).
11. **API surface** — OpenAPI annotations complete (operationId, errors, examples);
    versioning policy respected (additive-or-new-major); SDK codegen regenerated
    (CI artifact diff must be empty after build).
12. **Ops readiness** — feature flag registered; runbook note added when the feature
    has a kill-switch or a manual recovery path.

---

## 2. CI Quality Gates (merge-blocking, every one of the 9)

| # | Gate | Workflow job | Failure means |
|---|------|--------------|---------------|
| 1 | **Lint** | `ci.yml → quality` (`pnpm lint` — eslint strict-type-checked + boundaries + vendor confinement) | blocked |
| 2 | **Type check** | `quality` (`pnpm typecheck` — `tsc -b` across workspace) | blocked |
| 3 | **Tests** | `quality` (`pnpm test`) + `e2e` job for PRs touching e2e-scoped paths + diff-coverage ≥ 80% | blocked |
| 4 | **Prisma validate** | `quality` (`prisma validate`) + `db-drift-check.yml` (`migrate diff` vs shadow DB) | blocked |
| 5 | **Build** | `quality` (`pnpm build` — all apps/packages incl. prisma client gen) | blocked |
| 6 | **Dependency audit** | `quality` (`node infra/scripts/check-dependency-graph.mjs` — cycles/layers/drift) | blocked |
| 7 | **Security scan** | `security` job (CodeQL per-PR, `osv-scanner` on lockfile, `pnpm audit --prod --audit-level=high`, Trivy on images in `build-images.yml`) | blocked on high/critical |
| 8 | **Secret scan** | `security` job (gitleaks diff scan w/ `.gitleaks.toml` rules incl. `aca_live_` shape; trufflehog history nightly) | blocked |
| 9 | **License check** | `security` job (`license-checker --failOn 'GPL-*;AGPL-*'` on prod deps; summary artifact per PR) | blocked |

Supporting (also required but advisory unless flaky): prompt-evals gate when
`packages/ai/prompts/**` changes; plugin-conformance gate when capability code
changes; contracts-drift-check when `packages/shared/src/contracts/**` changes.

**Branch protection on `main`:** all 9 jobs named required status checks · approvals: 1 ·
linear history (squash merges) · signed commits enforced for tags · required
conversation resolution · no direct pushes (bots included — deploy keys are CI-scoped).

**Triage SLA for red main:** latest red commit is reverted within 30 minutes of notice
(revert PR, not fix-forward — main is always deployable); flakiness is treated as a bug
with a 48 h quarantine policy.

---

## 3. PR description minimums (template enforces)

Context (2 lines) · ADR/doc links · risk-class checkbox (`data|money|security|migration|contract` →
triggers extra required checkboxes) · evidence attachments for budgets (per DoD-6) ·
rollout plan: flag name + default + owner + revert note.

## 4. Commit conventions (history must stay teachable)

`type(scope): imperative ≤ 72 chars` — types: `feat fix perf refactor docs test chore build ci revert`;
scope = package/module (`feat(worker): …`, `fix(shared): …`); body: what+why (wrap 100),
breaking changes via `BREAKING CHANGE:` footer (feeds changelog + SDK major logic);
reverts reference the reverted sha. Commits are **small and intent-atomic** — a reader
must be able to bisect any bug to one commit and understand it without the PR.
