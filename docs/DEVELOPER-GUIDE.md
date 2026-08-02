# Developer Guide — AutoCreator AI

> Baseline `v1.0-foundation`. Commands below were verified against this repo
> layout; anything not yet scaffolded is marked **(planned)** rather than faked.

## 1. Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 22.0.0 |
| pnpm | 9.15.9 (`corepack enable && corepack prepare pnpm@9.15.9 --activate`) |
| Docker + Compose | any current (data plane only) |
| TypeScript | 5.6.3 (pinned by workspace; strict flags on) |

## 2. Run the project (first time)

```bash
git clone <repo> && cd autocreator-ai
pnpm install                                # workspace bootstrap
pnpm dev:bootstrap                          # compose data plane + db push + prisma client + seed
pnpm dev                                    # turbo dev — runs every scaffolded app (apps/api today)
```

`dev:bootstrap` exports the dev env (`DATABASE_URL`, `REDIS_URL`, MinIO S3 vars…),
starts Postgres/Redis/MinIO/Mailpit/ClamAV/Jaeger/Bull Board, applies the schema
(`prisma db push` until real migrations land), generates the Prisma client, and
seeds the 5 plans. Re-runnable (idempotent).

Verify the API: `GET http://localhost:3000/health` → `{"status":"ok",…}`;
`GET /health/ready` (checks PG + Redis); docs at `http://localhost:3000/docs`,
spec at `/openapi.json`, metrics at `http://localhost:3000/metrics`.

## 3. Run tests

```bash
pnpm test                                   # all unit tests (vitest, turbo-cached)
pnpm --filter @aca/api test                 # one workspace only
ACA_EVENTS_IT=1 pnpm --filter @aca/events exec vitest run --config vitest.integration.config.ts
                                            # events backbone e2e (needs compose PG+Redis up)
pnpm build                                  # tsc strict build of every package/app (typecheck gate)
```

Structural gates (run exactly what CI runs, zero-install):

```bash
node infra/scripts/check-dependency-graph.mjs
node infra/scripts/generate-event-catalog.mjs --check
node infra/scripts/generate-dependency-diagram.mjs --check
node infra/scripts/generate-er-diagram.mjs --check
awk '/^```prisma$/{flag=1;next} flag && /^```$/{exit} flag' docs/Database.md | \
  diff - packages/database/prisma/schema.prisma
```

## 4. Run workers **(planned)**

`apps/worker` is not scaffolded at v1.0 — nothing to run yet. When it lands it
runs as `pnpm --filter @aca/worker dev` (fleet = orchestrator / pipeline /
render / publisher / analytics); this section gains real commands in that
module's PR. Queue introspection is already available via Bull Board at
`http://localhost:3030` (compose).

## 5. Run services (local data plane)

| Service | Port | Purpose |
|---|---|---|
| Postgres 16 + pgvector | 5432 | system of record (72 models; outbox/inbox/DLQ included) |
| Redis 7.4 (AOF, noeviction) | 6379 | queues, rate limits, dedup windows |
| MinIO (S3) | 9000/9001 console | assets/renders/logs buckets auto-created |
| Mailpit | 8025 UI / 1025 SMTP | outbound email capture |
| ClamAV | 3310 | upload scanning |
| Jaeger | 16686 UI / 4318 OTLP | trace backend (API exports OTLP) |
| Bull Board | 3030 | queue UI |

`docker compose up -d` (or let `dev:bootstrap` do it). App HMR runs natively
via `pnpm dev` — only dependencies are containerized.

## 6. Project structure

```
apps/
  api/                  NestJS 11 + Fastify 5 modular monolith ✅
    src/common/         context · errors · validation · telemetry · http · auth ·
                        guards · rate-limit · idempotency · prisma/redis providers
    src/health, metrics
  web/                  (planned)  worker/ (planned)
packages/
  shared/   layer 0 — pure contracts: ids, errors, permissions, plan-features, zod contracts
  config/   layer 1 — env schema/validation
  logger/   layer 2 — pino
  database/ layer 2 — prisma + tenant-scoped client + seeds
  events/   layer 3 — outbox/inbox backbone, DLQ, replay, cursors
  eslint-config, typescript-config   (dev-only tooling)
docs/                 20 design docs + adr/ + diagrams/ + releases/
infra/scripts/        bootstrap + CI gate scripts
```

Rules that CI enforces: dependency graph acyclic + layered
(`docs/dependency-graph.json`); package-root imports only; vendor SDKs only
inside `**/adapters/**` or `**/providers/**`; `Database.md §3 == schema.prisma`
byte-for-byte; event catalog + both diagrams regenerated, never hand-edited.

## 7. Add a new API module

Modules are feature folders under `apps/api/src/<module>/`. The platform layers
(context, guards, filters, validation, metrics) are global — a module adds only
its slice:

1. `apps/api/src/<module>/<module>.module.ts` — Nest module, registered in `app.module.ts`.
2. `<module>.controller.ts` — **thin**: routing + decorators only. Every
   endpoint: `@UseZod({ body: CreateXBody, params: OrgXParams })` (validation), guard metadata
   (`@RequiresCapabilities`/`@RequiresFeature`/`@RequiresCredits` as applicable),
   `@Idempotent` on mutations, and OpenAPI decorators (`@ApiOperation`,
   `@ApiResponse`, real `@ApiBody`/`@ApiQuery` examples). No `if` statements
   that smell like business rules — controllers call services, that's it.
3. `<module>.service.ts` — business logic; receives the **tenant-scoped**
   client (`forOrganization(ctx)`) — never the raw system client for org data.
4. Domain events go out via the transactional outbox (`@aca/events`), never via
   a side-channel: business writes + outbox rows in ONE transaction.
5. Tests: `test/<module>.spec.ts` — service seams (pure where possible),
   DTO/guard wiring; integration suites run against the compose data plane.
6. Wire edges: first consumption of a workspace package moves it from
   `plannedEdges` into `edges` in `docs/dependency-graph.json` **in the same
   commit**; regenerate `docs/diagrams/dependencies.md`.
7. API surface must match `docs/API.md`; changing the contract = docs PR first.

## 8. Add an AI provider

Frozen port: `docs/Contracts.md` C3 (`ILLMProvider`, `ITTSProvider`,
`IImageProvider`, `IStockProvider`, `IMusicProvider`,
`ITranscriptionProvider`, `ISearchProvider`) — zod-schemas in
`packages/shared/src/contracts/ai-providers.ts`.

1. Implementation lives in the future `@aca/ai` package under
   `src/providers/<vendor>.ts` — the vendor SDK may be imported **only there**
   (zero-lock-in rule; deep-import policy enforced).
2. Constructor takes `{ apiKey, baseUrl?, logger }`; returns usage accounting
   (tokens/cost micros) with every call — the ledger depends on it.
3. Register in the provider registry/factory (composition root) keyed by
   capability + tier; agents never see concrete providers — `ctx.route()`.
4. Tests: contract conformance fixture (shared test-suite per port) + a mocked
   transport; no live vendor calls in CI.
5. Kill-switch/circuit-breaker config goes through `@aca/config` env schema —
   new keys land in `schema.ts` + `ENV_MAP` with validation.

## 9. Add a publisher (platform client)

Frozen port: Contract C6 `IPublisherClient` (packages/shared/src/contracts/
publisher-client.ts) — upload, publish, schedule, metrics pull, token refresh,
`externalRef` reconciliation.

1. Client in the future worker-side publishing fleet under
   `providers/<platform>.ts`; OAuth tokens come **only** from the vault
   (`channel_credentials`, envelope-encrypted — ADR-007), never from env/files.
2. Respect platform quota objects; emit `aca.publishing.*` events via outbox.
3. Exactly-once side effects are impossible — use platform idempotency keys +
   `externalRef` lookup before creating remote objects.
4. ToS/compliance checklist: `docs/Security.md` (platform API sections).

## 10. Add a plugin

Frozen port: Contract C2 `PluginManifest` + `@aca/plugin-kit` (planned).

1. Author `plugin-manifest.ts` (id, version, capabilities, permissions,
   sandbox resource limits) validated by the zod manifest schema.
2. Plugin code runs in the worker sandbox (`@aca/worker-plugins`, planned) —
   host imports only through the kit; no workspace internals.
3. Marketplace listing lifecycle (`PluginRecord`/`MarketplaceListing`) is the
   distribution path; installs materialize into the buyer org.
4. Ship a fixture plugin + conformance test mirroring the docs' plugin
   simulation (`docs/Validation-Report.md`).

## 11. Conventions cheat-sheet

- Commits: `type(scope): message` (conventional); docs change first, code after.
- Money: minor units; AI cost in micros. IDs: UUIDv7 (`@aca/shared` ids).
- Errors: RFC 9457 only (`ApiError` + problem-details filter). No ad-hoc JSON.
- Time: `timestamptz`, UTC. API: path-versioned `/v1`.
- Architecture change? ADR first (`docs/adr/README.md`, append-only).
