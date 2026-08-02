# Architecture Decision Records (ADR) — Master Index

**Governance:** an ADR is immutable once *Accepted* — corrections happen via a new,
superseding ADR. Every ADR below names: the decision, why, what was rejected (and why),
and **the exact code/packages that implement it** (so decisions are traceable to code,
not decoration). New ADRs follow `docs/adr/NNNN-kebab-title.md` and are appended here
by the same PR. Statuses: **Accepted** (normative) · **Proposed** (under review) ·
**Superseded by NNNN**.

---

## Final Index (v1.0-foundation, 2026-08-02)

| ADR | Decision (short) | Status |
|---|---|---|
| 001 | NestJS + Fastify modular monolith (framework) | Accepted — version pin superseded by 026 |
| 002 | Turborepo 2 + pnpm workspaces monorepo | Accepted |
| 003 | BullMQ + central Orchestrator; Temporal-ready seam | Accepted |
| 004 | REST /v1 + OpenAPI, public-API-first | Accepted |
| 005 | FFmpeg 7 behind `IVideoEngine` | Accepted |
| 006 | One monolith + worker fleets; extract on measured pain | Accepted |
| 007 | Token vault: envelope encryption (AES-256-GCM, KMS KEK) | Accepted |
| 008 | Stripe default inside `IPaymentProvider` port | Accepted |
| 009 | Redis Streams + transactional outbox + inbox dedup | Accepted (extended by 024) |
| 010 | Plugins: capability-bound adapters; untrusted code never in core | Accepted |
| 011 | Workflow engine: versioned DAG definitions; pipeline is data | Accepted |
| 012 | Tenancy v2: org-rooted + Teams + capability RBAC + brand/domains | Accepted |
| 013 | Public platform: URI versioning + OAuth 2.0 AS + SDK-from-OpenAPI | Accepted |
| 014 | Billing engine: provider port with normalized events | Accepted |
| 015 | Feature flags: OpenFeature + DB provider, cascade resolution | Accepted |
| 016 | AI Memory: durable knowledge with confidence/decay/supersede | Accepted |
| 017 | AI Employees: persona layer + `ai_messages` artifacts | Accepted |
| 018 | Scale path: orgId shard key invariant → cells | Accepted |
| 019 | Media: CDN-first; origin never client-visible | Accepted |
| 020 | Analytics: PG partitions now; OLAP port at measured pain | Accepted |
| 021 | Observability: OpenTelemetry everywhere; Jaeger backend | Accepted |
| 022 | Platform ids: registry Strings, not PG enums | Accepted |
| 023 | Executor concurrency: optimistic `state_version` + run-hash sharding | Accepted |
| 024 | Events guarantees: envelope v1.1, PG-only truth, durable DLQ, replay cursors | Accepted |
| 025 | apps/api foundation: infra-before-controllers, RFC 9457, cumulative wiring | Accepted |
| 026 | Framework uplift forced by security gate (Nest 11/Fastify 5/OTel 0.217/vitest 3) | Accepted — supersedes 001 version pin |

---

## ADR-001 · Backend framework: NestJS 10 + Fastify  *(superseded to NestJS 11 + Fastify 5 by ADR-026 — the module/DI-decision stands)*

- **Decision:** API is a NestJS modular monolith on the Fastify adapter.
- **Why:** first-class DI/guards/interceptors (RBAC, audit, tenancy are cross-cutting);
  native BullMQ + WebSocket modules; Swagger/OpenAPI generation for SDKs; ~2–3×
  Express throughput via Fastify; long-running patterns (queue consumers, graceful
  shutdown) are primitives, not add-ons.
- **Rejected:** Next.js API routes (serverless timeouts kill render/pipeline work, no
  first-class WS, couples business logic to the web runtime) · Express (no architecture
  enforcement) · tRPC (TypeScript-only coupling blocks public API/SDK/mobile).
- **Implemented by:** `apps/api/**` (modules/guards/filters), `apps/worker/**` (DI context),
  `docs/Architecture.md` §5.

## ADR-002 · Monorepo: Turborepo 2 + pnpm workspaces

- **Why:** pipeline caching across 20+ units, pnpm catalogs for version pinning, minimal
  config mass vs Nx's generator ecosystem we don't need.
- **Rejected:** Nx (heavier mental model) · Lerna (dead tooling trajectory) · polyrepo
  (contract drift between web/api/shared — the exact failure mode shared-zod prevents).
- **Implemented by:** `turbo.json`, `pnpm-workspace.yaml`, root `package.json`.

## ADR-003 · Pipeline orchestration: BullMQ + central Orchestrator; Temporal-ready seam

- **Why:** durable run/step tables + QueueEvents-driven state machine give resumable
  runs with review gates that can pause for days (nested flow trees handle that poorly);
  local-dev friendly; ops via Bull Board. Temporal remains the documented migration
  target behind the orchestrator seam (no agent knows the transport).
- **Rejected:** Temporal now (cluster ops tax at MVP) · Step Functions (lock-in, cost per
  transition at 100k+ videos/mo) · per-agent self-chaining (scatters the state machine:
  un-auditable).
- **Implemented by:** `apps/worker/src/orchestrator/**`, `packages/database` (`pipeline_runs`,
  `pipeline_step_runs`), job envelopes in `@aca/events`.

## ADR-004 · API style: REST /v1 + OpenAPI (public-API-first)

- **Why & rejected:** see ADR-001 (same evaluation; second dimension of it).
- **Implemented by:** `apps/api/src/**/v1` controllers layout, `GET /v1/openapi.json`,
  SDK codegen (`.github/workflows/sdk-publish.yml`), `docs/API.md`.

## ADR-005 · Video engine: FFmpeg 7 behind `IVideoEngine`

- **Why:** deterministic CPU cost model with plan-gated quality knobs (this is the COGS
  battleground); declarative `RenderJobSpec` makes renders pure functions of input
  (idempotency via `specHash`); cloud engines can be adopted per-plan without touching
  pipeline code.
- **Rejected:** managed render APIs as default (3–10× cost at target volume; kept
  possible as a plugin) · Remotion-in-browser (SSR CPU waste + weak RTL text shaping vs
  libass, which handles Arabic captions correctly).
- **Implemented by:** `packages/video-engine/**`, render workers in `apps/worker`.

## ADR-006 · One modular monolith + worker fleets; extract services only on measured pain

- **Why:** microservice split now would buy coordination overhead, not scalability
  (queue-based backing is already independently scalable); extraction is prepared by
  events-only side effects and scope, not by premature deployment boundaries.
- **Rejected:** microservices from day one · single Next.js does-everything app.
- **Implemented by:** repository layout, `docs/Architecture.md` §3/§6, events backbone.

## ADR-007 · OAuth/BYOK token vault: envelope encryption (AES-256-GCM, KMS KEK)

- **Why:** platform tokens are the #1 asset; envelope per-record data keys bound blast
  radius of any single unwrap to one credential; KMS gives rotation without redeploys
  and audit trails of decrypts.
- **Rejected:** app-level single master key (one leak = all tokens) · DB-only pgcrypto
  (key lives next to data) · third-party vault proxies (latency + lock-in; revisit at SOC2 Type II).
- **Implemented by:** `apps/api/src/infra/vault/vault.service.ts`, `channel_credentials`,
  `provider_credentials`, `sso_connections`, `docs/Security.md` §4.

## ADR-008 · Billing: Stripe as default adapter inside `IPaymentProvider` port

- **Why:** fastest path to compliant checkout/portal/Connect payouts; but core never
  sees provider payloads (normalized domain events), so Paddle/LemonSqueezy/regional
  PSPs are adapter-level additions (required by business model: mada/STC Pay corridor).
- **Rejected:** Stripe as hard dependency (violates zero-lock-in; killed in Phase 0.5) ·
  building our own ledger-free billing (PCI/compliance insanity).
- **Implemented by:** `packages/billing/**` (`payment-provider.interface.ts`,
  `providers/stripe.adapter.ts`), provider-agnostic billing tables.

## ADR-009 · Event backbone: Redis Streams + transactional outbox + inbox dedup

- **Why:** "events only" between modules needs *exactly-once effect* — outbox removes
  the DB-commit/queue-publish split-brain, inbox dedup absorbs at-least-once delivery;
  streams give consumer groups + replay at zero new infra; Kafka is the measured
  stage-B flip via the same `IEventBus` port.
- **Rejected:** direct BullMQ-as-bus (no fanout consumer groups) · Kafka now (ops tax
  before measured need) · NATS (would also work; streams already in-house via Redis).
- **Implemented by:** `packages/events/**` (`outbox/writer|relay`, `inbox/dedup`,
  `adapters/redis-streams`), `outbox_events`, `processed_events`.

## ADR-010 · Plugin system: capability-bound adapters; untrusted code never in core

- **Why:** requirement #2 (provider additions without core edits) is only real if first-
  party providers are plugins too (dogfooded) and third-party code is sandboxed by
  network/credential isolation, not by review promises.
- **Rejected:** runtime `require()` inside api/worker (supply chain + SSRF + theft) ·
  WASM sandbox (agent-execution ergonomics too costly for v1; revisit).
- **Implemented by:** `packages/plugin-kit/**` (manifest/conformance), `apps/worker-plugins/**`,
  `plugin_registry`, `plugin_installations`, `docs/Security.md` §15.

## ADR-011 · Workflow engine: versioned DAG definitions; pipeline is data

- **Why:** user-editable automation and marketplace both require flows as replicable,
  versionable artifacts; executor stays generic; runs pin versions (in-flight stability).
- **Rejected:** hardcoded transition table (v1 plan — superseded by Phase-0.5 requirement #3)
  · BPMN engine (XML-era complexity for a 24-node ceiling problem).
- **Implemented by:** `packages/workflows/**`, `workflows`, `workflow_versions`,
  executor in `apps/worker/src/orchestrator/workflow-executor.service.ts`.

## ADR-012 · Tenancy v2: org-rooted + Teams + capability RBAC + brand/domains

- **Why:** enterprise sales need custom roles without code paths; agencies need
  team-scoped projects; white-label revenue needs brand/domain as data, not forks.
- **Rejected:** role-enum-only RBAC (forces code change per enterprise ask) ·
  schema-per-tenant (migration fan-out unmanageable at 10k+ tenants; orgId shard key
  + RLS + cells gives the same isolation with operable topology).
- **Implemented by:** `teams`, `custom_roles`, `organization_brands`, `custom_domains`
  tables; tenant extension in `@aca/database`; modules `teams|roles|branding|domains`.

## ADR-013 · Public API platform: URI versioning + OAuth 2.0 AS + SDK-From-OpenAPI

- **Why:** we are a platform product (requirement #6); consent-scoped third-party access
  is a platform-ToS prerequisite for integrations; SDK generated from the same spec the
  server emits kills drift.
- **Rejected:** header versioning (invisible in logs/gateways) · admin-only API keys
  forever (blocks ecosystem) · hand-written SDKs (rot on contact).
- **Implemented by:** `apps/api/src/modules/developer/**`, `developer_apps*`, `oauth_*`
  tables, `.github/workflows/sdk-publish.yml`, `docs/API.md` §6.

## ADR-014 · Billing engine: provider port with normalized events (see ADR-008)

- **Implemented by:** `packages/billing/**`; `POST /webhooks/payments/{provider}`.

## ADR-015 · Feature flags: OpenFeature standard, DB provider, cascade resolution

- **Why:** OpenFeature abstraction avoids inventing a flag protocol (swappable to
  Flagsmith/Unleash later); cascade user→org→plan→global covers sales and rollout needs;
  every capability ships flagged (release policy), which requires the system exist early.
- **Rejected:** LaunchDarkly day-one (cost + lock-in; adapter compatible later) ·
  homegrown JSON endpoint (reinvents an existing standard).
- **Implemented by:** `packages/feature-flags/**`, `feature_flags`, `feature_flag_overrides`,
  `GET /v1/flags/bootstrap`.

## ADR-016 · AI Memory: durable per-channel knowledge with confidence, decay, supersede

- **Why:** the compounding moat is what the system *learns per channel*; without
  confidence/decay/supersede, memory becomes a poison-able bag of stale "facts".
  Advisory-only by design — enforcement stays in QC gates.
- **Rejected:** raw analytics replay per prompt (token blowout, no synthesis) ·
  style-preset-only mutation (v1 plan — lost explainability and channel specificity).
- **Implemented by:** `memory_entries` (+pgvector), `apps/worker/src/memory/**`,
  `pipeline_step_runs.memory_ids` (explainability), `docs/AI-Pipeline.md` §5.

## ADR-017 · AI Employees: persona layer + `ai_messages` coordination artifacts

- **Why:** users buy outcomes and *trust narratives*; coordination-as-data makes runs
  inspectable/educational at zero extra compute (personas wrap capabilities, they are
  not services).
- **Rejected:** separate agent-run times persona services (cost, no value) · static
  marketing copy (would collapse on contact with real run data).
- **Implemented by:** `ai_employees`, `ai_messages`, `apps/worker/src/team/**`.

## ADR-018 · Scale path: orgId shard key invariant → cells; measured stage triggers

- **Why:** "serve 1M users without rewrite" is an *invariant to protect now* (shard key
  in every row/event/key) plus *topology changes later* executed by ops, not by
  refactoring; stages flip on measured triggers (v2.1) not vanity org counts.
- **Rejected:** Citus/Yugabyte now (distributed-DB ops at 0 users) · "scale when it hurts"
  without invariants (that IS the rewrite).
- **Implemented by:** tenant key everywhere (schema), `docs/Architecture.md` §15,
  cell groundwork in `infra/terraform/modules`.

## ADR-019 · Media: CDN-first; origin never client-visible

- **Why:** egress economics + global latency + a clean security boundary (signed
  cookies/params); immutable content-addressed keys make caching trivially correct.
- **Rejected:** on-the-fly resize lambdas (cold latency + request-time cost vs
  precomputed variants) · presigned-origin URLs in API responses (leaks origin host,
  bypasses CDN).
- **Implemented by:** `packages/storage` (cdn-url builder), `terraform/modules/cloudfront`,
  asset pipeline emitting CDN paths (`assets.cdn_path`).

## ADR-020 · Analytics: Postgres partitions now; OLAP read port at measured pain

- **Why:** PG16 partitions + rollups answer 10k-org analytics honestly; the seam
  (`analytics read port` returning the same DTOs from ClickHouse after CDC) exists so
  the swap is invisible to APIs when rollup p95 degrades.
- **Rejected:** ClickHouse now (second datastore before needed) · forever-Postgres
  (self-deception at 100k+ orgs).
- **Implemented by:** partitioned analytics tables, `apps/api/src/modules/analytics/**`
  (read-port seam), Architecture §15 stage-B trigger.

## ADR-021 · Observability: OpenTelemetry everywhere; Jaeger as backend

- **Why:** requirement #12 names Jaeger; OTel instrumentation means the backend is an
  env var (lock-in-free); trace context flows through job AND event envelopes so a
  video run is one trace across 15 nodes and the outbox hop.
- **Rejected:** provider-native agents (re-implementation per backend) · traces-only
  (metrics/logs/traces are a package deal).
- **Implemented by:** `@aca/logger`, `infra/**/otel`, Jaeger compose/helm.

## ADR-022 · Platform ids: registry-driven Strings (NOT a PG enum)  *(v2.1 — from Validation §5)*

- **Why:** the plugin simulation proved a publisher plugin cannot add a platform when
  `platform` is a database enum — schema migration + core edits required = failure of
  requirement #2. Strings + app-layer registry make platforms data.
- **Rejected:** enum + plugin enum patches (cross-package schema edits per plugin —
  exactly the coupling the plugin system exists to kill).
- **Implemented by:** 7 String columns (`channels.platform`, `*_target_platforms`,
  `publishing_tasks`, both analytics tables, `trend_snapshots`), platform registry in
  `@aca/shared`, generic OAuth descriptor flow (API §13.1).

## ADR-023 · Workflow executor concurrency: optimistic `state_version` + run-hash sharding  *(v2.1)*

- **Why:** parallel branch completions can arrive microseconds apart; compare-and-set
  on a version column makes advancement atomic without distributed locks; sharding
  replicas by run-id keeps per-run ordering while scaling the executor horizontally.
- **Rejected:** advisory locks per run (DB round-trip per event; hot) · single
  orchestrator forever (SPOF + CPU ceiling) · last-write-wins (silent double-advance —
  the bug).
- **Implemented by:** `pipeline_runs.state_version`, executor compare-and-set in
  `workflow-executor.service.ts`, subscription sharding in `processor.factory.ts`.

---

## ADR-024 · Events backbone guarantees: envelope v1.1 (correlation/causation/producer/metadata), PG-only truth, durable DLQ, replay & cursors  *(v2.2)*

- **Why:** the events package must carry full causal chains (trace any video from
  idea to publish) and honest exactly-once semantics. Four additive envelope fields
  (`correlationId` default = own id, `causationId` nullable, `producer` injected at
  outbox write, `metadata` default `{}`) close the chain without breaking C1 consumers.
  Redis Streams remains **transport only**: truth is PG — `outbox_events` (write-side
  journal), `processed_events` (inbox dedup, same tx as consumer domain writes),
  `dead_letter_events` (durable DLQ — supersedes §7.3 `events:dlx:{domain}` stream as
  the source of truth; the stream MAY remain as a notification surface), and the new
  `consumer_cursors` (per `(consumer, stream)` last committed stream id checkpointed
  in the same tx as the dedup insert — Redis group state becomes disposable cache,
  re-bootstrapped from cursors after a Redis flush).
- **Exactly-once budget (the honest line):** per `(consumer, eventId)`, state
  transitions are exactly-once (dedup row + domain writes share one tx). External
  side effects (YouTube upload, email send, webhook delivery) are at-least-once;
  mitigated by provider-side idempotency keys where the vendor supports them plus
  pull-based reconciliation (publisher/email/webhooks-out owners listed in
  docs/Events-Guarantees.md). Nothing else in the industry guarantees more.
- **Retry/DLQ:** defaults `maxAttempts=10` (matches §7.3), exp backoff 1 s→15 min
  with ±20 % jitter, per-consumer override; DLQ replay returns the ORIGINAL envelope
  (same id) to the stream — dedup never hides a replay because the operator either
  replays to a NEW consumer group or scopes a rebuild (delete projection + dedup rows)
  first; both procedures are scripted in `packages/events/src/replay/`.
- **Catalog & versioning:** the machine-readable catalog of all 60 event types
  (`contracts/event-catalog/*` in `@aca/shared`: name, version, producer, consumers,
  zod payload) is frozen C1 material; `docs/Event-Catalog.md` is CI-generated from it;
  any breaking payload change → new envelope `version` dual-emitted (C1 policy) —
  never mutate v1.
- **Rejected:** DLQ as Redis stream only (violates "Redis is transport") · new
  envelope v2 for the four fields (no consumer exists yet to protect; additive wins) ·
  Kafka now (§15 stage B stays the flip — the port is unchanged) · consumer offsets
  only in Redis (flush = full re-delivery storm).
- **Implemented by:** `packages/events` (outbox writer/relay, bus adapter, consumer
  runner, replay, metrics) · `contracts/event-catalog/*` · `dead_letter_events` +
  `consumer_cursors` tables · docs/Events-Guarantees.md, docs/Event-Catalog.md,
  docs/Event-Flows.md, docs/Event-Capacity.md.

---

## ADR-025 · apps/api platform foundation: infra-before-controllers, RFC 9457 everywhere, cumulative graph wiring  *(v2.3)*

- **Why:** `apps/api` is the only public HTTP surface; every guarantee of the
  contract (docs/API.md §1/§15) must hold structurally, not by discipline. The build
  order is therefore enforced as layers that exist BEFORE any controller: middleware
  → exception filter → validation → logging → OTel → request context → guards →
  controllers. Each layer is its own commit; a controller cannot compile without the
  layers below it (module import graph).
- **Request invariants (structural):** every request carries
  `{ requestId (uuidv7, echoed as X-Request-Id), correlationId (X-Correlation-Id or
  = requestId), organizationId (after TenantGuard), userId (after AuthGuard),
  traceId (W3C traceparent, extracted or minted) }` in an AsyncLocalStorage
  `RequestContext` — controllers/services read it, they never re-derive it from
  headers. Every error, thrown anywhere, exits through ONE
  `ProblemDetailsFilter` producing RFC 9457 bodies with the platform `code` enum
  (shared/errors.ts, append-only); no route may shape its own errors.
- **Guard chain order (fixed):** `IpAllowList → AuthN (session JWT HS256 or
  X-API-Key sha256) → Tenant (org membership ACTIVE + path/header org match,
  TENANT_VIOLATION on mismatch) → RBAC (capability check via shared
  ROLE_CAPABILITIES + CustomRole grants — never role names, ADR-012) → Entitlements
  (Subscription.status ∈ {ACTIVE, TRIALING} + Plan.features flag, else FLAG_LOCKED /
  QUOTA_EXCEEDED) → Credits (estimated-cost pre-check against latest
  AiCreditTransaction.balanceAfter, else CREDIT_INSUFFICIENT; the debit itself is a
  service-layer transaction with the domain write)`. Rate limiting (Redis
  sliding-window, per bucket config from API.md §16) and idempotency (below) wrap
  mutations only.
- **Idempotency (mutations):** `Idempotency-Key` + `(scope, actorHash)` unique in
  Postgres `idempotency_records` (source of truth — survives Redis flush by design,
  same doctrine as ADR-024). IN_FLIGHT lease rejects concurrent duplicates with
  `IDEMPOTENCY_CONFLICT`; completed records replay the stored response
  byte-identically; `requestHash` mismatch → `IDEMPOTENCY_CONFLICT`.
- **AuthN interim:** until `@aca/auth` (L2) lands, the API verifies first-party
  session JWTs directly (HS256, key from config secrets section) and API keys via
  `api_keys.keyHash` sha256 lookup. This is the REAL verification path, not a stand-in;
  `@aca/auth` will swap the issuer/verifier implementation without touching guards'
  contracts.
- **Cumulative wiring policy (graph):** `docs/dependency-graph.json` reflects
  packages that EXIST today. `edges["@aca/api"]` therefore starts as
  `[shared, config, logger, database, events]` and each unbuilt dependency
  (`auth, billing, email, storage, search, feature-flags, workflows` — kept in
  `plannedEdges`) is added in the same commit that first wires it. The drift gate
  stays strict-equality against the REAL state at all times.
- **Observability:** OTel NodeSDK at bootstrap (OTLP/HTTP from config observability
  section; no-op when unconfigured) + middleware mints the server span per request;
  prom-client exposes `/metrics` (default + `aca_http_*` histograms); health surface
  `/health`, `/health/live`, `/health/ready` (PG `SELECT 1` + Redis `PING` for
  ready). OpenAPI is generated (`@nestjs/swagger`) from the same decorators that
  enforce validation — docs can never drift from behavior; contract tests snapshot
  the generated document.
- **Rejected:** controllers before infrastructure (the entire failure mode this ADR
  exists to prevent) · idempotency in Redis only (eviction loses keys; PG is truth) ·
  waiting for all 12 planned `@aca/*` deps before starting apps/api (serializes the
  whole roadmap; cumulative wiring keeps the gate honest) · role-name guards
  (violates ADR-012 capability model) · hand-written OpenAPI yaml (drifts from code;
  generation makes drift impossible).
- **Implemented by:** `apps/api` (bootstrap, middleware, filter, pipe, interceptors,
  guards common module) · `idempotency_records` table (Database.md §3) ·
  `@aca/config` auth section · `packages/shared` errors catalog (existing).

---

## ADR-026 · Framework uplift: NestJS 11 + Fastify 5 (supersedes ADR-001 version pin), OTel 0.217, vitest 3 — forced by the security gate  *(v2.4)*

- **Why:** the FIRST full-dependency install happened on GitHub CI (the sandbox
  has no pnpm). `pnpm audit --audit-level=high` failed with 2 critical / 16 high
  advisories, and querying the GitHub Advisory Database proved the fastify-4 /
  NestJS-10 line has **no patched releases for its own criticals**:

  | Advisory | Package | Vulnerable | First patched |
  |----------|---------|-----------|----------------|
  | GHSA-72c6/v9ww/8p85/cxrg (crit+high) | @fastify/middie | ≤9.3.1 (our chain: middie@8 via fastify@4) | 9.2.0–9.3.2 — **no 8.x fix** |
  | GHSA-jx2c-rxcm-jvmq (high) | fastify | <5.7.2 | 5.7.2 — **no 4.x fix** |
  | GHSA-6v32/r4wm/wf42 (high) | @nestjs/platform-fastify | ≤11.1.23 | 11.1.14/16/24 |
  | GHSA-q7rr-3cgh-j5r3 (high) | @opentelemetry/sdk-node / exporter-prometheus | <0.217.0 | 0.217.0 |
  | GHSA-45rx (high) | @opentelemetry/propagator-jaeger | <2.9.0 | 2.9.0 |
  | GHSA-5xrq-8626-4rwp (critical) | vitest | <3.2.6 (our catalog: 2.1.8) | 3.2.6 — **no 2.x fix** |
  | GHSA-fx2h (high) | vite | ≤6.4.2 | 6.4.3 |
  | GHSA-c96f (high) | find-my-way | ≤9.6.0 | 9.7.0 |
  | GHSA-q3j6/v39h (high) | fast-uri | ≤3.1.1 | 3.1.2 |
  | GHSA-52cp (high) | js-yaml | 4.0.0–4.2.x | 4.3.0 |
  | GHSA-r5fr (high) | lodash | ≤4.17.23 | 4.18.0 |
  | GHSA-2w6w (critical) | handlebars | ≤4.7.8 | 4.7.9 (override, prior commit) |
  | GHSA-…vitest UI (critical) | vitest UI server file-read | (bundled in 3.2.6 fix) | 3.2.6 |

- **Decision:** uplift in ONE move — NestJS `^11.1.24` (common/core/platform-fastify),
  Fastify `^5.7.2`, `@nestjs/swagger` `^8` (Nest-11 line), OTel `sdk-node` +
  `exporter-trace-otlp-http` `^0.217.0`, workspace vitest catalog `^3.2.6`,
  `find-my-way@^9.7.0`/`fast-uri@^3.1.2` come bundled with fastify 5.7.x,
  plus pnpm overrides as floors where a transitive consumer could pin stale:
  `handlebars ≥4.7.9`, `js-yaml ≥4.3.0`, `fast-uri ≥3.1.2`,
  `@fastify/middie ≥9.3.2`, `find-my-way ≥9.7.0`, `lodash ≥4.18.0`.
  Module/DI/guard architecture from ADR-001/ADR-025 is untouched — this is a
  version-plane change only (public API of Nest guards/interceptors is stable
  10→11 for our usage; RequestContextMiddleware signature unchanged under
  fastify 5 middie).
- **Rejected:** pnpm-overriding transitive floors while STAYING on
  NestJS 10 / fastify 4 (proven above: no patched middie 8.x / fastify 4.x
  exists to pin to) · `pnpm.auditConfig.ignoreGhsas` for criticals (hiding
  criticals is not a remediation; only advisories with no code path to the
  vulnerable surface may ever land there, each with a written justification) ·
  dropping pnpm audit from CI (the gate caught real exposure — it stays,
  permanently).
- **Implemented by:** `apps/api/package.json` (framework/otel bump),
  root `package.json` pnpm.overrides floors, `pnpm-workspace.yaml` vitest
  catalog, `docs/adr/README.md` (this entry + ADR-001 supersession note).

---

### How to write a new ADR

1. Copy the format above into `docs/adr/NNNN-title.md`.
2. Fill: context/forces → decision → rejected alternatives with **why** → consequences
   (including what becomes *harder*) → implementing code paths (commit references welcome).
3. Append a row here in the same PR. PRs changing accepted behavior without an ADR are
   reverted by policy (docs/README governance).

### Current status rollup

| Band | ADRs | Status |
|------|------|--------|
| 001–008 | v1 foundation | Accepted |
| 009–021 | Phase 0.5 expansion | Accepted |
| 022–023 | v2.1 validation amendments | Accepted (machine-verified design) |
| 024 | v2.2 events backbone guarantees | Accepted |
| 025 | v2.3 apps/api platform foundation | Accepted |
| 026 | v2.4 framework uplift forced by security gate | Accepted |
