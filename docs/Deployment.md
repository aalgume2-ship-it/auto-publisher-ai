# AutoCreator AI — Deployment & Operations (v2)

**Status:** Approved v2.0 (Phase 0.5) · **Registry:** GitHub Container Registry (`ghcr.io/autocreator-ai/*`)

**v2 delta summary:** Jaeger replaces Tempo · CloudFront CDN distributions added ·
`worker-plugins` isolated pool · outbox relay 2-replica deployment · Kafka-ready
bus note · Cloudflare-for-SaaS for custom portal domains · docker-compose gains
`jaeger` + keeps everything runnable locally.

---

### 2.1 Local stack additions (docker-compose v2)

Add to the v1 compose file:

```yaml
  jaeger:
    image: jaegertracing/all-in-one:1.60
    environment: { COLLECTOR_OTLP_ENABLED: "true" }
    ports: ["16686:16686", "4318:4318"]   # UI + OTLP/HTTP

  kafka-local:                        # OPTIONAL profile for stage-B eventbus work
    image: apache/kafka:3.8.0
    profiles: ["kafka"]
    ports: ["9092:9092"]
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      CLUSTER_ID: acaLocalKafkaCluster1
```

Local dev defaults: OTel exporter → Jaeger at `http://localhost:4318`.

### §5 additions (production topology v2)

- **CDN:** two CloudFront distributions (`cdn.autocreator.ai` immutable assets,
  `media.autocreator.ai` signed-cookie private renditions) fronting S3 via OAC;
  WAF ruleset shared with edge; default TTL table per Architecture §11.
- **Custom portal domains:** Cloudflare for SaaS — customers CNAME to
  `portal.autocreator.ai`; SSL for SaaS issues certs; a small `domain-router`
  NGINX server-name wildcard routes by Host to `web`; activation/suspension
  driven by `custom_domains.status` events.
- **workerpools:** `worker-plugins` deployment on a **tainted node group**
  (`dedicated=plugins:NoSchedule`), NetworkPolicy: egress allowlist + Redis/PG
  only via sidecar proxy; **no** KMS/K8s-API access; KEDA scales on
  `plugin_rpc_queue_depth`.
- **Outbox relay:** dedicated Deployment ×2 (`leaderless`, SKIP LOCKED makes it
  shardless), HPA target on `outbox_backlog`; SLO alert `publish_lag p95 < 2s`.
- **Event bus:** Redis streams in stage A; Terraform module `msk` is written
  behind a flag for stage B (flip = env change to `IEventBus` adapter).
- **Tracing:** Jaeger (production Helm `jaeger` in `observability` ns,
  Elasticsearch-free: Badger → Cassandra at stage B); Collector receives OTLP
  from api/worker/plugins/web-RUM (sampled 100% staging, 15% prod tail-based
  with 100% on ERROR and on `pipeline_run` root spans).

### §4 CI additions (v2)

- `plugin-conformance.yml` — first-party adapters must pass `@aca/plugin-kit`
  suites on every change to `packages/ai|packages/video-engine`.
- `sdk-publish.yml` — on `v*` tag: generate `@autocreator/sdk` from
  `/v1/openapi.json`, version-sync, publish to npm via OIDC (NPM provenance).
- Cost workflow `weekly-cost-report.yml` gains router-decision export
  (objective→winner histograms per org) feeding the FinOps dashboard.

### §6 env catalog additions

| Var | Apps | Notes |
|-----|------|-------|
| `EVENTBUS_DRIVER` (`streams\|kafka`) + `KAFKA_BROKERS` | api,worker | stage-B flip |
| `CDN_PUBLIC_DOMAIN` / `CDN_PRIVATE_DOMAIN` / `CDN_SIGNING_KEY_PAIR_ID` / `CDN_SIGNING_PRIVATE_KEY` | api,worker | signed URLs/cookies |
| `JAEGER_ENDPOINT` | all | OTel target |
| `PLUGIN_RPC_QUEUE` / `PLUGIN_EGRESS_ALLOWLIST` | worker-plugins | isolation config |
| `CLOUDFLARE_SAAS_API_TOKEN` | api (domains module) | custom-domain SSL lifecycle |
| `SCIM_TOKEN_PEPPER` | api | SCIM hashing pepper (KMS-adjacent) |

### §11 cost budget note (v2)

Add-ons: CloudFront (~8–12% of previous egress bill, offset by S3 egress
savings ≈ 60%), Jaeger stack ≈ $180/mo at stage A, plugins pool nodes
(+2× c6i.large spot ≈ $70/mo), MSK at stage B (~$500/mo small) — margin model
in Business-Model §5 unchanged (absorbed in infra line at 1k-org scale).


---

## 1. Environment Matrix

| | local | staging | production |
|---|---|---|---|
| Web | `localhost:3000` (Next dev) | `staging.autocreator.ai` | `app.autocreator.ai` |
| API | `localhost:4000` | `api.staging.autocreator.ai` | `api.autocreator.ai` |
| Postgres | docker `postgres:16.4` | Cloud SQL/RDS `db-custom-2-7680` | HA primary r6g.2xlarge + 1 read replica, PITR 35d |
| Redis | docker `redis:7.4` | managed small HA pair | managed HA, AOF everysec |
| Object storage | MinIO (S3 API) | S3 `aca-stg-*` | S3 `aca-prod-*` + CloudFront + versioning + CRR |
| Secrets | `.env.local` + docker secrets | Doppler `aca-stg` | Doppler `aca-prd` |
| Deploy trigger | — | every merge to `main` | manual `workflow_dispatch` w/ env approval |
| Data | seed script | seeded demo orgs (synthetic fixtures) | customer data only |

---

## 2. Preview on Render (one-click Blueprint — durable trial URL)

`render.yaml` (repo root) provisions the full preview stack on Render —
web service + managed Postgres 16 + free KeyValue (Redis protocol) — with
zero local tooling:

1. <https://dashboard.render.com> → **New → Blueprint** → connect this repo.
2. Render reads `render.yaml` and runs, per deploy: pnpm install → prisma
   generate → `turbo build` → **pre-deploy** `ensure-vector.mjs` (pgvector,
   idempotent) → `prisma db push` → `pnpm db:seed` → start
   `node apps/api/dist/main.js`.
3. When Live, the service URL (`https://<service>.onrender.com`) serves
   `/docs`, `/openapi.json`, `/health`, `/health/ready`, `/metrics` publicly;
   the remaining surface needs a session JWT: mint one from the web service's
   Render **Shell** tab — `node infra/scripts/mint-dev-token.mjs` (demo-org +
   demo user seed because `NODE_ENV=development`; a staging cut sets
   `NODE_ENV=production`, skipping demo data per Database.md §7).

Free-plan realities (Render, by design): web sleeps after 15 min idle (cold
start on next request), free Postgres lasts 90 days, KeyValue free tier is
25 MB. `AUTH_JWT_SECRET` is generated per service by Render; `TRUST_PROXY`
is set so per-client rate limiting keys off the real client IP behind
Render's balancer.

---

## 2. Local Development Stack

`docker-compose.yml` (repo root) — complete runnable definition:

```yaml
name: autocreator-ai
services:
  postgres:
    image: postgres:16.4-alpine
    environment:
      POSTGRES_USER: aca
      POSTGRES_PASSWORD: aca_dev_pw
      POSTGRES_DB: autocreator
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U aca"], interval: 5s, retries: 10 }

  redis:
    image: redis:7.4-alpine
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "512mb", "--maxmemory-policy", "noeviction"]
    ports: ["6379:6379"]
    volumes: ["redisdata:/data"]
    healthcheck: { test: ["CMD", "redis-cli", "ping"], interval: 5s, retries: 10 }

  minio:
    image: minio/minio:RELEASE.2025-07-23T15-54-02Z
    command: ["server", "/data", "--console-address", ":9001"]
    environment: { MINIO_ROOT_USER: aca, MINIO_ROOT_PASSWORD: aca_dev_secret }
    ports: ["9000:9000", "9001:9001"]
    volumes: ["miniodata:/data"]
    healthcheck: { test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"], interval: 5s, retries: 10 }

  minio-init:                       # one-shot: buckets + CORS for the dev flow
    image: minio/mc:RELEASE.2025-07-21T05-28-08Z
    depends_on: { minio: { condition: service_healthy } }
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        mc alias set local http://minio:9000 aca aca_dev_secret
        mc mb -p local/aca-assets local/aca-renders local/aca-logs
        mc anonymous set download local/aca-assets   # presigned flow still used; public only for local previews

  mailpit:                          # capture all outgoing email
    image: axllent/mailpit:v1.21
    ports: ["8025:8025", "1025:1025"]

  clamav:                           # upload scanning — same topology as prod sidecar
    image: clamav/clamav:1.4
    ports: ["3310:3310"]
    volumes: ["clamdb:/var/lib/clamav"]

  bullboard:                        # queue UI in dev (staging/prod gets SSO-gated deployment)
    image: deadly0/bull-board:3.2.12
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
    ports: ["3030:3000"]
    depends_on: { redis: { condition: service_healthy } }

volumes: { pgdata: {}, redisdata: {}, miniodata: {}, clamdb: {} }
```

Dev bootstrap (`pnpm dev:bootstrap` script): compose up → `prisma migrate deploy`
→ seed → start `api`, `worker`, `web` in watch mode via `turbo dev`.
The three apps run **natively** (not containerized) in dev for HMR/debugging;
Docker images are built only in CI to guarantee dev↔prod parity through CI builds.

---

## 3. Container Images

### 3.1 `apps/api` Dockerfile (multi-stage, `infra/docker/api.Dockerfile`)

```dockerfile
# ---- deps: full workspace install for build ----
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --filter @aca/api...

# ---- build ----
FROM deps AS build
COPY . .
RUN pnpm --filter @aca/database exec prisma generate
RUN pnpm --filter @aca/api build

# ---- runtime: pruned production deps ----
FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S aca && adduser -S aca -G aca
COPY --from=build --chown=aca:aca /repo/apps/api/dist ./dist
COPY --from=build --chown=aca:aca /repo/node_modules ./node_modules
COPY --from=build --chown=aca:aca /repo/packages/database/dist/prisma-client ./node_modules/.prisma
USER aca
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/v1/health || exit 1
CMD ["node", "dist/main.js"]
```

### 3.2 `apps/worker` Dockerfile

Identical stages to §3.1 with two changes: base runtime adds
`ffmpeg-7.x` + `libass` + fonts (Noto incl. Arabic) via
`apk add ffmpeg libass font-noto font-noto-cjk`, and `CMD ["node","dist/main.js"]`
starts the standalone consumer context. Render-heavy autoscaling uses a second
image tag `worker-render` built `FROM … AS runtime-render` with CPU-tuned
`nice` wrappers — same binary, different deployment resource limits.

### 3.3 `apps/web` Dockerfile

Next.js standalone output (`output: "standalone"`) copied into a
`node:22-alpine` runner; public assets served by CDN in prod via
`assetPrefix`. Healthcheck on `/api/healthz` (route handler).

### 3.4 Image policy

- Tags: `sha-<gitsha>` (immutable) + env alias `staging` / `prod` re-pointed by CD only.
- All images Trivy-scanned; cosign-signed (phase 5); no `latest` anywhere.
- Base images pinned by digest and refreshed by Renovate.

---

## 4. CI/CD — GitHub Actions

### 4.1 `.github/workflows/ci.yml` (every PR + main)

```yaml
name: ci
on:
  pull_request:
  push: { branches: [main] }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }

jobs:
  setup:
    runs-on: ubuntu-24.04
    outputs: { turbo-cache-key: ${{ steps.key.outputs.k }} }
    steps:
      - uses: actions/checkout@v4
      - id: key
        run: echo "k=turbo-${{ hashFiles('pnpm-lock.yaml') }}" >> "$GITHUB_OUTPUT"

  quality:
    runs-on: ubuntu-24.04
    needs: setup
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4   # version from packageManager field (9.15.9)
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint               # eslint + boundaries + prettier --check
      - run: pnpm typecheck          # tsc -b across workspace
      - run: pnpm test               # vitest unit suites, affected-first via turbo
      - run: pnpm build              # full build incl. prisma generate
      - run: pnpm --filter @aca/database exec prisma validate
      - run: pnpm audit --prod --audit-level=high

  e2e:
    runs-on: ubuntu-24.04
    services:
      postgres: { image: postgres:16.4-alpine, ports: ["5432:5432"],
        env: { POSTGRES_PASSWORD: e2e, POSTGRES_USER: e2e, POSTGRES_DB: aca_e2e } }
      redis:    { image: redis:7.4-alpine, ports: ["6379:6379"] }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @aca/database db:push:test
      - run: pnpm test:e2e           # supertest API suites + sinked providers
        env:
          DATABASE_URL: postgresql://e2e:e2e@localhost:5432/aca_e2e
          REDIS_URL: redis://localhost:6379
          AI_PROVIDER_MODE: recorded   # contract-test cassettes (recorded real responses, refreshed monthly)

  security:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: gitleaks/gitleaks-action@v2
      - uses: ossf/scorecard-action@v2.4.0
        with: { publish_results: false }
```

### 4.2 `.github/workflows/build-images.yml` (main only, after ci)

Matrix builds (`api`, `worker`, `worker-render`, `web`) → Trivy scan → push
`ghcr.io/autocreator-ai/<app>:sha-<sha>` with OIDC login (`id-token: write`,
no stored registry creds).

### 4.3 `.github/workflows/deploy-staging.yml`

Trigger: successful `build-images` on main. Steps: Doppler inject →
`helm upgrade -i aca ./infra/helm -n aca-staging -f values.staging.yaml
--set image.tag=sha-$SHA` → pre-upgrade hook runs migration Job →
Argo-rollouts canary (10% → 100% over 10 min with p95/error SLO analysis) →
smoke suite (`/v1/health/ready`, auth roundtrip, enqueue+complete synthetic
pipeline on the `canary` org) post-deploy.

### 4.4 `.github/workflows/deploy-production.yml`

Manual `workflow_dispatch` with required reviewer environment `production`:
pin same immutable sha from staging, identical helm flow, canary 5% → 25% →
100% with automatic rollback on SLO breach; Slack changelog; GitHub Release
tag `vYYYY.MM.DD-N` auto-created.

### 4.5 Database migrations

- CI: `prisma migrate diff` drift check against shadow DB (PR gate).
- Deploy: K8s Job (`helm.sh/hook: pre-upgrade`) `prisma migrate deploy` —
  rollout blocked until success (expand-and-contract per Database.md §7).
- Partition-ahead job runs nightly (system queue) creating partitions 3 months
  forward — never part of deploy path.

---

## 5. Production Topology (AWS reference; GCP equivalents noted)

```mermaid
flowchart TB
    CF[Cloudflare<br/>DNS·WAF·TLS] --> ALB[ALB / Ingress NGINX]
    subgraph VPC
      ALB --> IG[K8s Ingress]
      subgraph EKS["EKS cluster (3 AZ)"]
        IG --> WEBP[web deployment ×3]
        IG --> APIP[api deployment ×4–12 HPA]
        subgraph WorkerNodes["node group: workers (spot-capable)"]
          WK1[agent consumers]
          WRD[render workers ×2–20 KEDA]
        end
        DBCON[PgBouncer sidecar]
      end
      RDS[(RDS PostgreSQL 16 Multi-AZ)] 
      RDRep[(read replica)]
      EC[(ElastiCache Redis 7 HA)]
      SM[KMS]
    end
    S3[(S3 buckets)] --> CDN[CloudFront]
    APIP & WK1 & WRD --> DBCON --> RDS
    APIP & WK1 --> EC
    WK1 & WRD --> S3
```

- **K8s:** 1.30+, namespaces `aca-prod` / `aca-staging`; `PDB` minAvailable for api/web; `NetworkPolicy` — workers egress-only except Redis/PG/S3; worker pods have **no** ingress.
- **HPA (api/web):** CPU 60% + custom `http_requests_per_second` target.
- **KEDA `ScaledObject`s:** trigger `prometheus` metric `bullmq_queue_waiting / concurrency` with `activationThreshold=1`, `minReplicas` per queue table (Architecture §11.1), render queue `maxReplicas=20` on the spot node group; scale-down stabilization 10 min (long jobs).
- **Secrets:** External Secrets Operator ← Doppler; KMS-encrypted etcd.
- **Ingress:** NGINX + cert-manager (Let's Encrypt), `request-body-limit: 2m` (uploads bypass API via S3 presign), per-IP ratelimit annotations as edge backstop.
- **Node pools:** `system` (t3.large, on-demand), `workers` (c6i.2xlarge spot w/ fallback OD), `render` (c7i.4xlarge spot, tainted) — BullMQ concurrency matches pod CPU budget (4/pod).

### 5.1 Bootstrap alternative (pre-K8s weeks, single VM)

`infra/compose/prod-lite.yml` runs api/worker/web + Caddy + PG/Redis on one
VM for the private beta (≤ 20 orgs). Migration path to EKS is a data snapshot
restore + DNS cutover — rehearsed in staging. K8s go-live is Phase-1 exit
criterion, so beta never outgrows the VM.

---

## 6. Configuration (env catalog — validated by zod in `packages/config`; boot fails fast on invalid)

| Var | Apps | Example | Secret |
|-----|------|---------|--------|
| `DATABASE_URL` | api,worker | `postgresql://…` | ✅ |
| `REDIS_URL` | api,worker | `rediss://…` | ✅ |
| `S3_ENDPOINT/BUCKET_ASSETS/BUCKET_RENDERS/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY` | api,worker | — | ✅ |
| `JWT_PRIVATE_KEY/JWT_PUBLIC_KEY` | api | PEM | ✅ |
| `KMS_KEY_ID` | api,worker | `alias/aca-prod-vault` | — |
| `STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET` | api | — | ✅ |
| `OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_AI_API_KEY / OPENROUTER_API_KEY / DEEPSEEK_API_KEY / ELEVENLABS_API_KEY / PEXELS_API_KEY / PIXABAY_API_KEY / STABILITY_API_KEY` | worker | platform-level fallbacks when org has no BYOK | ✅ |
| `GOOGLE_CLIENT_ID/SECRET`, `TIKTOK_CLIENT_KEY/SECRET`, `META_APP_ID/SECRET` | api | OAuth apps per environment | ✅ |
| `WEB_APP_URL / API_PUBLIC_URL` | api,web | — | — |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `SENTRY_DSN` | all | — | — |
| `AI_PROVIDER_MODE` | worker | `live` / `recorded` (e2e cassettes) | — |
| `RENDER_FFMPEG_THREADS`, `RENDER_NODE_POOL` | worker | tuning | — |
| `RESEND_API_KEY`, `EMAIL_FROM` | api | — | ✅ |

---

## 7. Observability Stack

| Component | Tool | Deployed |
|-----------|------|----------|
| Metrics | Prometheus (kube-prometheus-stack) + recording rules for SLOs | Helm |
| Dashboards | Grafana: `API SLO`, `Pipeline Health`, `AI Provider Cost & Latency`, `Render Farm`, `Business (signups/MRR/credits)` | Provisioned as code (`infra/grafana/*.json`) |
| Traces | OTel SDK → Collector → **Jaeger** (ADR-021); trace-per-pipeline-run across queues and event-envelope hops | Helm |
| Logs | Pino → stdout → Promtail → Loki (30d) + S3 archive (13mo) | Helm |
| Errors | Sentry SaaS (api/worker/web projects, release & sourcemap upload in CI) | SaaS |
| Queues | Bull Board at `/ops/queues` behind Cloudflare Access (SSO) | sidecar deployment |
| Uptime | Gatus synthetic: `/v1/health`, login roundtrip, full canary pipeline every 15 min → status page | Helm |
| Alerts | Alertmanager → PagerDuty (page: prod-down, burn-rate fast, IR triggers from Security §12) / Slack (slow-burn) | Helm |

**SLO alerts implemented:** API availability 99.9% (30d), p95 < 300 ms; pipeline P50 < 12 min; publish success > 99.5%; provider-cost anomaly (> +50% daily baseline); credit-ledger drift > 0.

*Internal note: server-side analytics collection requires quota monitoring —
Prometheus gauges `platform_api_quota_used{platform}` alert at 80%.*

---

## 8. Secrets rotation policy

| Secret | Cadence | Method |
|--------|---------|--------|
| DB/Redis creds | Quarterly | Managed-service rotation → Doppler → rolling restart |
| JWT signing keypair | Quarterly, 2-key overlap (kid) | CI job |
| Vault KEK | Annual (data keys per-record, re-wrapped on access) | KMS alias repoint |
| Stripe restricted keys | Annual | Console + Doppler |
| Provider API keys | On vendor notice / annually | Doppler |

---

## 9. Backups & Disaster Recovery

| Item | Backup | Verify | Restore (runbook target) |
|------|--------|--------|--------------------------|
| Postgres | WAL PITR 35d + daily snapshot | Automated nightly restore to scratch instance + row-count checksum | **RTO 1h / RPO 5min** — promote restored instance, repoint Doppler, rolling restart |
| Redis (queues) | AOF + daily RDB→S3 | Weekly restore drill | Rebuild from snapshot; durable `pipeline_runs` re-enqueue active steps (auto-recovery job) |
| S3 | Versioning + cross-region replica | Weekly object-existence probe of random sample | Failover bucket alias |
| K8s state | Everything declarative in git (Helm + ExternalSecrets) | `helm template` diff in CI | Full cluster rebuild ≤ 2h |
| Doppler config | Sealed break-glass export in 1Password vault, refreshed monthly | Quarterly access drill | Re-import |

Quarterly **GameDay**: scripted loss of one AZ + Redis flush + simulated
provider outage; publish results to eng log. IR/communication tree:
on-call → eng lead → status page → customer email thresholds (≥ 30 min
customer-visible impact).

---

## 10. Release & Rollback Policy

- Trunk-based; short-lived feature branches; squash merges; conventional commits (`feat(api): …`) feed auto-changelog.
- Rollback = `helm rollback` to previous sha pin (≤ 3 min); migrations are expand-and-contract so rollbacks never face a destructive schema delta within the same release window (contract migrations run ≥ 7 days later).
- Feature flags (per-org, stored in `organizations.features` JSON via Plan features): `publisher_tiktok`, `optimizer_auto`, `render_hd`…; flags default-off in prod, soak in staging 5 business days.

---

## 11. Cost Budget (monthly, AWS list prices, on-demand/spot blend)

| Stage | Profile | Monthly estimate |
|-------|---------|------------------|
| Staging (always-on small) | 2× t3.large nodes, small RDS/Redis, minimal S3 | ≈ $420 |
| Prod @ beta (100 orgs) | 2 api pods, 2 worker pods, db.custom medium, 2TB S3 egress-light | ≈ $1.1k + AI spend ≈ $0.6k |
| Prod @ 1k orgs / 10k videos-mo | api×6, workers×8, render×6 spot, r6g.xl, 25TB S3, CDN | ≈ $5.8k + AI ≈ $5k |
| Prod @ 10k orgs / 100k videos-mo | api×12, worker×24, render×20 spot, r6g.2xl + replica, 250TB S3 | ≈ $41k + AI ≈ $42k (still ≥ 75% GM at plan mix from Business-Model §5) |

FinOps controls from day one: per-step cost ledger, daily cost-anomaly alert,
S3 lifecycle rules as code, spot-first render pool, budget alerts at
80/95/105% with auto-page.
