# AutoCreator AI — Monorepo Folder Structure (v2)

**Tooling:** Turborepo 2 + pnpm 9.15 · **Node:** 22 LTS · **TS:** 5.6 strict · **Status:** Approved v2.0

v2 deltas: new packages (`events`, `workflows`, `plugin-kit`, `feature-flags`,
`search`, `email`, `storage`, `ports`-style subfolders), API per-version
controllers layout, isolated `apps/worker-plugins`, SSO/SCIM/OAuth-AS modules,
marketplace & AI-team modules, infra additions (CDN, Jaeger, KEDA for plugins pool).

---

## 1. Full Tree

```text
autocreator-ai/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml · build-images.yml · deploy-staging.yml · deploy-production.yml
│   │   ├── db-drift-check.yml · prompt-evals.yml · weekly-cost-report.yml
│   │   ├── plugin-conformance.yml        # runs @aca/plugin-kit suites on first-party adapters
│   │   └── sdk-publish.yml               # openapi → @autocreator/sdk build & npm publish (tagged)
│   ├── CODEOWNERS · dependabot.yml · PULL_REQUEST_TEMPLATE.md
│
├── apps/
│   ├── web/                              # @aca/web — Next.js 15 (UI only)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx · globals.css
│   │   │   │   ├── (marketing)/[locale]/{page,pricing,features,legal/*}
│   │   │   │   ├── (auth)/{login,register,forgot-password,reset-password,verify,mfa-challenge}
│   │   │   │   │   └── oauth/callback/page.tsx            # Google login exchange
│   │   │   │   ├── (oauth)/
│   │   │   │   │   └── consent/page.tsx                   # third-party app consent screen
│   │   │   │   ├── (dashboard)/[orgSlug]/
│   │   │   │   │   ├── dashboard/page.tsx
│   │   │   │   │   ├── analytics/{page,[videoId]/page}.tsx
│   │   │   │   │   ├── calendar/page.tsx
│   │   │   │   │   ├── library/{page,[videoId]/page}.tsx  # detail: preview, crew notes, memory-used
│   │   │   │   │   ├── studio/{page,ideas,scripts,voices,thumbnails}/** # AI Studio
│   │   │   │   │   ├── workflows/
│   │   │   │   │   │   ├── page.tsx                       # library: org + templates + marketplace
│   │   │   │   │   │   └── [workflowId]/editor/page.tsx   # JSON editor P2 · visual DAG editor P3
│   │   │   │   │   ├── team-room/page.tsx                 # AI employees + ai_messages feed
│   │   │   │   │   ├── channels/{page,[channelId]/memory/page}.tsx
│   │   │   │   │   ├── publishing/page.tsx
│   │   │   │   │   ├── automation/page.tsx
│   │   │   │   │   ├── marketplace/{page,[slug]/page}.tsx  # browse/install; creator console subroute
│   │   │   │   │   ├── plugins/page.tsx                   # installs/config/health
│   │   │   │   │   ├── billing/page.tsx
│   │   │   │   │   ├── settings/
│   │   │   │   │   │   ├── page.tsx                       # profile+org+security policy
│   │   │   │   │   │   ├── members/page.tsx · teams/page.tsx · roles/page.tsx
│   │   │   │   │   │   ├── branding/page.tsx · domains/page.tsx
│   │   │   │   │   │   ├── sso/page.tsx · provisioning/page.tsx   # SAML/OIDC + SCIM tokens
│   │   │   │   │   │   ├── api-keys/page.tsx · webhooks/page.tsx · developer-apps/page.tsx
│   │   │   │   │   │   └── connected-apps/page.tsx               # granted OAuth apps
│   │   │   │   │   └── logs/page.tsx                      # audit + jobs + eventbus inspector (admin)
│   │   │   │   └── api/{healthz/route.ts, branding/resolve/route.ts}  # thin BFF endpoints
│   │   │   ├── components/{ui,layout,charts,pipeline,workflows,channels,videos,forms,marketplace,plugins,team-room}
│   │   │   ├── hooks/… lib/{api-client.ts,ws.ts,flags.ts,format.ts}
│   │   │   ├── providers/{query,ws,i18n,theme,brand-theme,org-switcher}.tsx
│   │   │   └── i18n/{en,ar}.json
│   │   ├── middleware.ts                 # locale + auth fast-path + HOST→brand/theme bootstrap
│   │   └── (configs: next/tailwind/shadcn/vitest as v1)
│   │
│   ├── api/                              # @aca/api — NestJS 10 + Fastify
│   │   ├── src/
│   │   │   ├── main.ts                   # fastify, URI versioning, helmet, swagger(/v1), pipes
│   │   │   ├── app.module.ts
│   │   │   ├── common/
│   │   │   │   ├── decorators/{roles,capabilities,current-org,idempotent,public}.decorator.ts
│   │   │   │   ├── guards/{jwt-auth,api-key,oauth-app,roles-capability,plan-limit,ip-allowlist,sso-enforced}.guard.ts
│   │   │   │   ├── interceptors/{audit,logging,transform}.interceptor.ts
│   │   │   │   ├── filters/problem-details.filter.ts · pipes/zod-validation.pipe.ts
│   │   │   │   └── middleware/{request-id,rate-limit,host-brand}.middleware.ts
│   │   │   ├── infra/
│   │   │   │   ├── prisma/  redis/  queue/  storage/  realtime/
│   │   │   │   ├── vault/vault.service.ts                  # envelope crypto (KMS)
│   │   │   │   ├── events/outbox-publisher.service.ts      # tx-bound outbox insert helper
│   │   │   │   ├── email/resend.adapter.ts (IEmailPort)
│   │   │   │   ├── flags/flags.module.ts                   # OpenFeature provider (DB+cache)
│   │   │   │   └── telemetry/otel.module.ts
│   │   │   └── modules/                 # one folder per domain; v{N}/ subfolders for wire versions
│   │   │       ├── auth/            # + mfa/, strategies google/jwt
│   │   │       ├── users/ · notifications/
│   │   │       ├── organizations/ · teams/ · roles/ · branding/ · domains/
│   │   │       ├── sso/             # controllers: config + saml/{metadata,acs} + oidc/callback; services per protocol
│   │   │       ├── scim/            # /scim/v2 mount (users,groups) + token guard
│   │   │       ├── security-policy/ # ip allowlist, session policy
│   │   │       ├── billing/ · credits/
│   │   │       ├── channels/        # oauth flows per platform
│   │   │       ├── projects/ · trends/ · ideas/
│   │   │       ├── videos/ · scripts/ · assets/ · voices/
│   │   │       ├── workflows/       # CRUD + validate + publish + templates
│   │   │       ├── pipeline/        # run control/read models (nodeId-based)
│   │   │       ├── publishing/ · analytics/
│   │   │       ├── memory/ · ai-team/
│   │   │       ├── plugins/ · marketplace/
│   │   │       ├── developer/       # apps CRUD + /oauth/{authorize,token,revoke,userinfo} + consent
│   │   │       ├── flags/ · audit/ · apikeys/ · webhooks/ · admin/ · health/
│   │   ├── test/{auth.e2e,rbac-matrix.e2e,credits-race.e2e,sso-saml.e2e,oauth-as.e2e,workflow-validate.e2e}.spec.ts
│   │   └── (package.json, tsconfig.json, nest-cli.json, vitest.config.ts)
│   │
│   ├── worker/                           # @aca/worker — trusted consumers
│   │   ├── src/
│   │   │   ├── main.ts · worker.module.ts
│   │   │   ├── orchestrator/
│   │   │   │   ├── workflow-executor.service.ts     # generic DAG advancement (replaces transition-table)
│   │   │   │   ├── definition.loader.ts · gates.service.ts · loopback.guard.ts
│   │   │   ├── agents/                              # 15 core (agent kind folders, as v1 list)
│   │   │   │   ├── base-agent.ts · agent.registry.ts
│   │   │   │   └── trend-analyzer/ idea-generator/ script-writer/ fact-checker/ seo-optimizer/
│   │   │   │       voice-generator/ scene-planner/ asset-collector/ video-generator/
│   │   │   │       subtitle-generator/ thumbnail-generator/ quality-checker/
│   │   │   │       publisher/ analytics-collector/ ai-optimizer/
│   │   │   ├── processors/processor.factory.ts · metrics.plugin.ts
│   │   │   ├── team/                                # AI employees runtime
│   │   │   │   ├── persona-loader.ts · message-bus.ts · brief.composer.ts
│   │   │   ├── memory/
│   │   │   │   ├── memory.service.ts (compose/topK) · memory-writer.consumer.ts (on optimizer/analyst events)
│   │   │   │   ├── decay.job.ts · supersede.logic.ts
│   │   │   ├── events/                              # event consumers (inbox-dedup wrapper)
│   │   │   │   ├── consumer.base.ts · notifications.consumer.ts · ws-bridge.consumer.ts
│   │   │   │   ├── webhooks-out.consumer.ts · audit-mirror.consumer.ts · projections.consumer.ts
│   │   │   ├── system/
│   │   │   │   ├── outbox-relay.ts                  # SKIP LOCKED → streams (2 replicas)
│   │   │   │   ├── autopilot-scheduler.ts · token-refresh.ts · retention.ts · credit-grant.ts
│   │   │   │   ├── partitions.ts · digests.ts · sanitize/
│   │   │   └── infra/                               # prisma factory, s3, telemetry, eventbus client
│   │   └── test/agents/{script-writer,quality-checker,publisher,memory-writer}.spec.ts
│   │
│   └── worker-plugins/                   # @aca/worker-plugins — UNTRUSTED adapter runtime (isolated)
│       ├── src/
│       │   ├── main.ts                    # loads installed NPM adapters; queue-RPC server
│       │   ├── rpc/{server.ts,codec.ts}   # strict payload schemas, timeouts, mem caps
│       │   ├── sandbox/{loader.ts,limits.ts,health.ts}
│       │   └── adapters-registry.ts       # dynamic require() of plugin packages only
│       └── test/rpc.spec.ts
│
├── packages/
│   ├── shared/                           # @aca/shared — contracts (zod-first)
│   │   └── src/
│   │       ├── enums/ · types/ · utils/
│   │       ├── schemas/                  # all API DTOs + workflow.definition + plugin.manifest
│   │       │   + ai-team.message + memory.entry + marketplace.* + billing.* + brand.theme
│   │       ├── constants/{queues,plans,error-codes,route-permissions}.ts
│   │       ├── permissions/catalog.ts    # capability strings + role→capabilities map (doc-driven)
│   │       ├── agent-kinds.ts            # "agent.*" registry values + node kind helpers
│   │       └── version.ts
│   ├── events/                           # @aca/events — backbone (ADR-009)
│   │   └── src/{event-bus.interface.ts, envelope.ts, catalog.ts (typed events),
│   │           adapters/{redis-streams.adapter.ts}, outbox/{writer.ts,relay.ts}, inbox/dedup.ts}
│   ├── database/                         # @aca/database — prisma schema v2 + client factory + tenant ext
│   │   ├── prisma/{schema.prisma,migrations/,seed.ts,seeds/ (plans,workflow-autopilot-v1.json,
│   │   │   ai-personas.json,voices.json,first-party-plugins.json,feature-flags.json)}
│   │   ├── src/{index.ts,partitions.ts,vector.ts (embedding helpers),replica-router.ts}
│   │   └── test/{tenancy.spec.ts,outbox-relay.spec.ts}
│   ├── ai/                               # @aca/ai — capability interfaces + first-party adapters + router
│   │   └── src/
│   │       ├── capabilities/{llm,tts,image,stock,music,transcription,search,publisher,analytics}.ts
│   │       ├── router/{provider-router.ts,objectives.ts,policies.ts,pricelist.json,circuit-breaker.ts,quality-estimator.ts}
│   │       ├── providers/**              # first-party adapters (CONFORMANCE-tested)
│   │       ├── prompts/<agent>/<semver>.hbs + registry.ts + eval/
│   │       ├── embeddings/pgvector-store.ts · meter/cost-meter.service.ts · utils/safe-fetch.ts
│   ├── plugin-kit/                       # @aca/plugin-kit (public package later)
│   │   └── src/{manifest.ts (zod), types.ts (capability contracts), sdk.ts (helpers),
│   │           conformance/{llm.suite.ts,tts.suite.ts,publisher.suite.ts,video-engine.suite.ts,runner.ts}}
│   ├── video-engine/                     # @aca/video-engine (IVideoEngine port + ffmpeg adapter + qc probes)
│   ├── workflows/                        # @aca/workflows — definition compile/validate/graph utils/estimator
│   │   └── src/{definition.schema.ts,validate.ts,topo.ts,gates.ts,cost-estimate.ts,autopilot-v1.ts(template const)}
│   ├── feature-flags/                    # @aca/feature-flags — OpenFeature provider (DB+redis cache+events invalidation)
│   ├── billing/                          # @aca/billing — IPaymentProvider port
│   │   └── src/{payment-provider.interface.ts, normalize.ts, invoice-pdf.ts, entitlements.ts,
│   │           providers/{stripe.adapter.ts,lemon-squeezy.adapter.ts(stubbed P4),paddle.adapter.ts(stubbed P5)}}
│   ├── storage/                          # @aca/storage — IStoragePort + s3/minio adapters + cdn-url builder (signed)
│   ├── email/                            # @aca/email — IEmailPort + resend adapter + brand template packs renderer
│   ├── search/                           # @aca/search — ISearchPort + postgres-fts adapter (meili/typesense path)
│   ├── auth/                             # @aca/auth — jwt, argon, pkce, saml/oidc helpers, permissions eval
│   ├── config/                           # @aca/config — env zod (secret-marked), all apps boot-validate
│   ├── logger/                           # @aca/logger — pino presets + redaction + otel bindings
│   ├── ui/                               # @aca/ui — shadcn primitives + brand-token theming + RTL-safe components
│   ├── eslint-config/                    # boundaries: vendors only under **/adapters/** or **/providers/**
│   └── typescript-config/
│
├── infra/
│   ├── docker/{api,worker,worker-plugins,web}.Dockerfile
│   ├── compose/prod-lite.yml
│   ├── helm/                             # + worker-plugins chart (tainted pool), keda scaledobjects,
│   │                                     # outbox relay HPA, cdn origin config, jaeger.values
│   ├── terraform/{envs,modules/{vpc,eks,rds,elasticache,s3,cloudfront,kms,cloudflare-saas}}
│   ├── grafana/*.json · alerts/*.yaml
│   └── scripts/{seed-staging.sh,quota-report.sh,gameday.sh,dlx-replay.sh}
│
├── docs/                                 # approved design (this folder) + adr/ future
│
├── turbo.json · pnpm-workspace.yaml · pnpm-lock.yaml · package.json (root)
├── tsconfig.base.json · .eslintrc.js · .prettierrc.json · .editorconfig
├── .env.example · .gitignore · .dockerignore · .gitleaks.toml · docker-compose.yml
├── README.md · LICENSE· SECURITY.md (policy + security.txt)
```

---

## 2. Boundary Rules (v2, CI-enforced)

| Rule | Enforcement |
|------|-------------|
| `web` imports only `@aca/shared`, `@aca/ui`, `@aca/config(public subset)` | eslint boundaries |
| `api`/`worker` never import vendor SDKs outside `**/adapters/**` or `**/providers/**` | eslint boundaries + dependency-cruiser |
| `shared` imports nothing workspace-internal | eslint boundaries |
| Cross-module calls inside an app: exported services only (no deep imports) | boundaries `no-deep-import` |
| **Cross-deployable side effects** via `@aca/events` only (synchronous reads within deployable allowed) | code review + events catalog lint |
| Plugins communicate via `plugin-kit` RPC/HTTP contracts only | runtime: plugins pool has no DB/KMS network access (K8s NetworkPolicy + SG) |
| Secrets: no literals matching secret patterns outside `.env.example` names | gitleaks + `no-secret-literals` rule |

## 3. Naming Conventions (v2 additions)

| Item | Convention | Example |
|------|------------|---------|
| Event types | `aca.<domain>.<entity>.<past-verb>` | `aca.publishing.publish.completed` |
| Agent kinds | `agent.<kebab>` / plugin nodes `plugin.<slug>` | `agent.script-writer` |
| Workflow ids/nodes | explicit kebab ids, gates prefixed `gate-` | `gate-script` |
| Flags | dotted namespaced | `optimizer.auto_apply`, `publisher.tiktok` |
| Scopes (API/OAuth) | `<resource>.<read|write|manage|run>` | `workflows.run` |
| Capabilities | dotted capability contract ids | `llm.json`, `stock.video.search` |
| Commits | conventional + package scope | `feat(events): add kafka adapter skeleton` |

All v1 conventions (packages `@aca/*`, queue names `aca:{domain}:{name}`, DB
snake_case, i18n keys) remain normative.
