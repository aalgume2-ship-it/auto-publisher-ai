# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
baseline tags (`v<major>.<minor>-<phase>`) until the first product semver.

## [v1.0-foundation] — 2026-08-02

Baseline closing the Foundation Phase. No end-user runtime features; this tag
pins the verified platform substrate. Full narrative: `docs/releases/v1.0-foundation.md`.

### Added

- **Design corpus:** 20 normative docs under `docs/` + 26 ADRs with final
  tabular index; release notes; Developer Guide; CONTRIBUTING.
- **Generated diagrams with CI drift gates:** system architecture,
  workspace dependency graph (from `dependency-graph.json`), database ER
  (72 models / 94 relations, from `schema.prisma`), event flow, workflow/pipeline.
- **`@aca/shared`:** UUIDv7 ids; 25-code RFC 9457 error dictionary; RBAC
  permission algebra; `PlanFeaturesSchema`; frozen zod contracts (events,
  plugins, AI providers, payments, storage, publisher, workflow).
- **`@aca/config`:** strict env schema incl. API auth section; fail-fast load.
- **`@aca/logger`:** pino structured logging (version-proof interop).
- **`@aca/database`:** Prisma client factory, tenant-scoped extension
  (`forOrganization`), system client, 5 seed plans.
- **`@aca/events`:** transactional outbox, relay, idempotent inbox consumers,
  durable DLQ, replay + monotonic cursors (ADR-024); real PG/Redis integration
  suite (5 e2e).
- **`apps/api` platform foundation (ADR-025):** request-context middleware
  (request/correlation/org/user/trace ids), OTel SDK bootstrap, Prometheus
  `/metrics`, request logging, RFC 9457 filter, zod validation pipe, guard
  chain (Auth/Tenant/RBAC/Entitlements/Credits), Redis rate limiting,
  PG-backed idempotency, health ×3, OpenAPI shell at `/docs`.
- **CI:** 4-job pipeline — structural gates, build+test (143 unit tests),
  security audit, integration (real PG/Redis).

### Fixed

- pino interop under NodeNext (logger).
- CI: DATABASE_URL for prisma validate; `@aca/events` zod dependency;
  dependency-audit needs built shared; Postgres image → `pgvector/pgvector:pg16`
  (schema uses `vector`); integration bootstrap via `db push` (no migrations yet).
- Events dedup: cursor now advances monotonically on duplicate deliveries.
- `dev-bootstrap.sh`: `db push` instead of nonexistent `migrate deploy`.

### Security

- Framework uplift NestJS 11 / Fastify 5 / OTel 0.217 / vitest 3 (ADR-026):
  17 audit advisories closed via upgrades + pinned `pnpm.overrides` floors
  (handlebars, js-yaml, fast-uri, @fastify/middie, find-my-way, lodash,
  protobufjs, propagator-jaeger). `pnpm audit --audit-level=high` is clean.

### Known gaps (accepted, tracked)

- `pnpm-lock.yaml` not yet generated (sandbox) → CI installs with
  `--no-frozen-lockfile`; flip to frozen when the lockfile lands.
- No Prisma migration files yet → bootstrap via `db push` (CI + local).
- ESLint gate not yet in CI (rule set not authored);
  `@aca/eslint-config` is a tooling stub.
- `apps/web`, `apps/worker` and 12 packages exist only as planned graph nodes.

[v1.0-foundation]: https://github.com/aalgume2-ship-it/auto-publisher-ai/releases/tag/v1.0-foundation
