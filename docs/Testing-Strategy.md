# Testing Strategy

**Principle:** coverage targets are risk-weighted per package, not a vanity 100%.
The merge-blocking number is **diff coverage** (new/changed lines), plus mandatory
suites wherever physics can hurt us (tenancy, money, executor, plugins).

## 1. The pyramid (by intent, not just count)

```text
        ╱ e2e (golden paths, staging)   ~ 30 journeys — slow, few, sacred
       ╱ integration (api↔db↔redis↔s3)   dockerized per-PR, seeded per run
      ╱ contract (plugins/providers/events)  shared suites, also run by third parties
     ╱ unit (pure logic, ms each)        the bulk of signal
    ╱ static (lint/types/prisma validate/graph/graph drift)  always-on
  ─────────────────────────────────────────
  load (k6, nightly+pre-release) · chaos (weekly staging, monthly gameday) · security (RBAC/SSRF/auth batteries)
```

## 2. Layer policies

| Layer | Tooling | Required suites | Coverage gate |
|-------|---------|-----------------|---------------|
| `@aca/shared` (contracts) | vitest | zod round-trips, event catalog schema validation, permissions map↔docs sync test, workflow validator (cycles/limits) | **≥ 95% lines & functions** |
| `@aca/database` | vitest + pg testcontainers | **tenancy leak suite** (direct-org models read/write cross-org → must throw), id gen monotonicity, OCC helpers, partition plan SQL snapshot | **≥ 90%**; leak suite 100% pass, no threshold logic |
| `@aca/events` | vitest + redis container | outbox-in-tx (crash mid-publish → nothing lost), inbox dedup replay, relay catch-up, DLX move after N failures | **≥ 90%** |
| `@aca/ai` (router/meter/providers) | vitest + **recorded cassettes** (real provider responses, refreshed monthly, secrets out of band) | router fallback & objective scoring, circuit breaker transitions, structured-output repair pass, cost math equals ledger, SSRF guard battery | router/meter **≥ 90%**, providers ≥ 75% (external variance tolerated) |
| agents (`apps/worker`) | vitest + cassette context | each agent: valid/invalid output validation, idempotent re-run re-attaches, budget abort, moderation pre-hook; quality-checker golden fixtures (pass/fail videos) w/ golden-render snapshots per language (visual diff ≤ 1%) | **≥ 75%**, QC ≥ 85% |
| `@aca/video-engine` | vitest + golden renders | spec compiler snapshots, loudness probe math, caption RTL snapshot renders | **≥ 85%** |
| `@aca/plugin-kit` | vitest + sample plugin | conformance suites (they ARE the tests; also published to third parties), manifest schema, RPC timeouts & payload caps | **≥ 90%** |
| `apps/api` | vitest + supertest (pg/redis containers) | auth flows incl. reuse-detection, **RBAC matrix generated spec** (the matrix table is the fixture), credits race (parallel holds), idempotency replay, quota middleware, ETag/304, OAuth-AS code flow, SSO SAML fixture (signed response), SCIM CRUD | ≥ 70% overall; **guards/credits/entitlements = 100% line** |
| `apps/web` | vitest + testing-library + pw (visual) | critical components (pipeline timeline, gates, calendar DnD, team room), i18n key parity en↔ar (CI fail), RTL snapshot pass, axe on main flows | components ≥ 40% lines; journeys via e2e |
| e2e | Playwright on staging (ephemeral org per run) | 12 golden journeys (§4) | all must pass; flake quarantine policy ≤ 48 h |
| load | k6 (nightly on staging perf lane) | §5 scenarios & thresholds | SLO-attached thresholds; regression > 15% blocks release |
| chaos | `infra/scripts/chaos.ts` + gameday.sh | Failover-Plan scenarios, one/week rotating | per-scenario gates (Failover doc) |
| security | dedicated batteries (§6) | RBAC/SSRF/upload/auth/tenant | 100% pass — these are not coverage-tuned |

## 3. The honest numbers (why not 100%)

Global line coverage is a leading vanity metric we deliberately **do not** gate on:
the last 20% of controllers is thin pass-through code whose testing doubles cost for
~zero risk reduction. Instead: **diff coverage ≥ 80%** on every PR (new code must
carry its tests, always), 100% line gates on the money/tenancy/execution cores
listed above, and e2e/contract suites are capped at what stays green weekly —
a suite that flakes is deleted or fixed in 48 h, never muted.

## 4. The 12 golden e2e journeys (staging, Playwright)

1. Register → verify → login (password) + MFA enable + re-login via challenge.
2. Google OAuth round-trip incl. session refresh and logout-all.
3. Create org → invite member → accept → role downgrade blocks billing page (matrix).
4. Connect YouTube (provider sandbox) → reconnect after forced token revocation.
5. Create project → automation FULL_AUTO off/on → manual run → gate approve (edit script) → publish (mock publisher) → URL visible in library.
6. Credits: parallel run-starts never exceed budget (race harness), top-up flow (mock checkout webhook) updates balance once.
7. Workflow: clone template → remove a node → validate → run completes with gate shifts intact.
8. API key flow: create key, `curl` create-video via key, scopes deny write on analytics.
9. OAuth-AS: third-party app authorize (PKCE) → token → scoped call → revoke → 401.
10. SAML SSO: IdP-signed response → session, enforced domain rejects password login.
11. Tenant leak: seeded two orgs — every list/detail endpoint cross-checked (also covered at DB layer).
12. Team room: run generates brief/handoffs; user note posts; realtime feed updates without refresh.

## 5. Load gates (k6, staging perf lane identical topology, 3× smaller nodes)

| Scenario | Target (staging-scaled) | Blocks release if |
|----------|------------------------|-------------------|
| Auth+me+library mix @ 300 RPS, 10 min | p95 < 300 ms, err < 0.1% | p95 +15% vs baseline (2-week EWMA) |
| Orchestration: 60 step-jobs/s for 30 min | zero double-advance (state_version check in logs), outbox lag p95 < 2 s | any OCC conflict burst / lag breach |
| WS: 20k conns/pod | < 1% drop on broadcasts, reauth cycle clean | memory growth > 10% post-GC |
| Publisher storm: 500 tasks due same minute | quota service shifts max 5%, all settle < 30 min | task FAILED count > 0 for transient causes |
| Read-heavy analytics week-window org | p95 < 1.5 s on overview (stage-A) | breach → triggers OLAP stage-B ticket (per Architecture §15) |

## 6. Security test batteries (run per-PR subset + full nightly)

- `rbac-matrix`: every controller × every role × expected allow/deny (fixture = doc matrix — doc/code drift impossible by construction).
- `auth-attacks`: refresh reuse, kid confusion (reject non-allowlisted algs), PKCE downgrade, SSO signature wrapping (fixture XML), SAML replay assertion-id.
- `ssrf-canary`: asset-fetch against 169.254.169.254, 127.0.0.1, redirect-to-private, DNS-rebind pattern — all must 4xx with `SSRF_BLOCKED`.
- `upload-battery`: polyglot file, magic-byte mismatch, 2 GB boundary, EICAR sample (ClamAV must reject), SVG rejection.
- `tenant-fuzz`: randomized org/user/entity cross-access with token swap — every request must 404/403, and audit rows must exist for denials.
- `secrets-static`: gitleaks + custom rule: no string matching `aca_live_` or provider key formats outside allowlisted test fixtures.

## 7. Test data management

Per-suite ephemeral PG schema (`WITH TEMPLATE`), deterministic seed via
`packages/database/prisma/seed-test.ts` (factories per entity, no faker junk —
named fixtures exported for reuse across suites), provider cassettes scrubbed
(headers redacted; regenerated script `pnpm ai:cassettes:refresh` behind OIDC).
E2E orgs are disposable and tagged `e2e` (retention job purges < 24 h).
