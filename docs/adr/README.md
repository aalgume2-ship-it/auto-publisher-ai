# Architecture Decision Records (ADR) — Master Index

**Governance:** an ADR is immutable once *Accepted* — corrections happen via a new,
superseding ADR. Every ADR below names: the decision, why, what was rejected (and why),
and **the exact code/packages that implement it** (so decisions are traceable to code,
not decoration). New ADRs follow `docs/adr/NNNN-kebab-title.md` and are appended here
by the same PR. Statuses: **Accepted** (normative) · **Proposed** (under review) ·
**Superseded by NNNN**.

---

## ADR-001 · Backend framework: NestJS 10 + Fastify

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
