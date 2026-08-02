# Contributing to AutoCreator AI

This file is the contributor contract. The binding versions of everything
summarized here live in `docs/Engineering-Standards.md` (DoD, 9 CI gates,
branch protection) and the ADR index (`docs/adr/README.md`). When they
disagree, the standards doc wins — and you should open a PR fixing the
disagreement.

## Ground rules

1. **Docs change first, code after.** Behavior or contract change without the
   matching doc/ADR update in the same PR is a defect, not a shortcut.
2. **No mock code, no TODOs, no placeholders.** A merged file is production
   grade or it does not exist.
3. **Small, intent-atomic commits.** A reader must be able to bisect any bug
   to one commit and understand it without the PR.
4. **Honest evidence.** Commit/PR bodies state what actually ran (commands +
   output), not what should have run.

## Workflow

1. Branch from `main`: `feat/<area>-<slug>` · `fix/<area>-<slug>` ·
   `docs/<slug>` · `chore/<slug>`.
2. Make the change per the DoD (all 12 boxes — `docs/Engineering-Standards.md` §1).
3. Run locally what CI runs (see `docs/DEVELOPER-GUIDE.md` §3 — unit suites,
   strict build, the five zero-install structural gates).
4. Commit per §Conventions below; push; open the PR with the template minimums
   (context, ADR/doc links, risk-class checkbox, perf evidence where hot path,
   rollout plan with flag name/default/owner/revert note).
5. All 9 CI gates green + 1 approval + conversations resolved → squash merge.
   Red `main` is reverted within 30 minutes (revert PR, deployable main wins).

## Commit conventions

```
type(scope): imperative subject ≤ 72 chars

(body) what + why, wrapped at 100; for code commits append the executed
verification (command → one-line result). Breaking changes: BREAKING CHANGE: footer.
```

- **types:** `feat fix perf refactor docs test chore build ci revert`
- **scope:** the package/module (`feat(api): …`, `fix(events): …`)
- Reverts reference the reverted SHA.

## Non-negotiable invariants (CI-enforced where automatable)

| Invariant | Where enforced |
|---|---|
| Dependency graph acyclic, layered, zero drift | `infra/scripts/check-dependency-graph.mjs` |
| `docs/Database.md` §3 == `schema.prisma` byte-parity | structural-gates job |
| Event catalog + dependency diagram + ER diagram generated, never hand-edited | `--check` jobs |
| Vendor SDKs only under `**/adapters/**` or `**/providers/**` | deep-import/deepImportPolicy in `docs/dependency-graph.json` |
| Errors are RFC 9457 Problem Details only | `@aca/api` problem-details filter + review |
| `@aca/shared` imports nothing but zod | dependency audit |
| PR-first on `main`; no direct pushes | branch protection |
| No secrets in the tree | security/secret-scan gates |

## Architecture decisions

Any structural change (new dependency edge, framework version bump, guarantee
weakening, new external side effect) requires an ADR **before** implementation:
append `## ADR-NNN · title` to `docs/adr/README.md` with Why / Rejected /
Implemented-by, mark supersessions inline. ADRs are immutable once Accepted.

## Reporting cadence (project-level)

Progress reports ship every 5–10 commits: what completed / errors discovered /
fixes applied / what remains / GitHub link status. This is a standing project
rule from the sponsor, not optional ceremony.

## Getting started

Read `docs/DEVELOPER-GUIDE.md` (setup, tests, extension recipes for modules,
AI providers, publishers, plugins). Then pick a scoped task and follow §Workflow.
