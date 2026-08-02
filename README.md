# AutoCreator AI

**Autonomous, AI-native operation of YouTube, TikTok and Instagram channels** —
trend research → ideation → script → fact-check → SEO → voiceover → scenes →
assets → render → subtitles → thumbnails → quality gates → scheduling →
publishing → analytics → a learning loop that remembers what works on every
channel.

This repository contains the full platform: web app, public REST API,
workflow executor, plugin runtime, and all shared packages of the monorepo.

## Status

**Phase 2 — build in progress.** Baseline [`v1.0-foundation`](./docs/releases/v1.0-foundation.md)
(Foundation Phase closed: design corpus + 5 packages + API platform substrate +
green CI) is tagged; feature modules are being built per [`docs/Roadmap.md`](./docs/Roadmap.md).
What is scaffolded **today**: `apps/api` + `packages/{shared,config,logger,database,events}`
— everything else is designed-only (honest status in the
[dependency diagram](./docs/diagrams/dependencies.md)). Consult
[`docs/DEVELOPER-GUIDE.md`](./docs/DEVELOPER-GUIDE.md) before first run and
[`CHANGELOG.md`](./CHANGELOG.md) for tagged history.

## Stack

| Area | Choice |
|------|--------|
| Monorepo | Turborepo + pnpm workspaces |
| Web | Next.js 15 · React 19 · Tailwind 4 · shadcn/ui · TanStack Query · next-intl (en/ar) |
| API | NestJS 11 (Fastify 5) · REST /v1 · OpenAPI 3.1 · Socket.IO · OAuth 2.0 AS · SCIM (ADR-026 uplift) |
| Data | PostgreSQL 16 (+pgvector) · Prisma 5 · Redis 7 (BullMQ + event streams + cache) · S3 behind CloudFront |
| AI | Plugin-bound multi-provider capabilities (OpenAI · Anthropic · Google · OpenRouter · DeepSeek · ElevenLabs …) with cost-optimizing router |
| Video | FFmpeg 7 behind `IVideoEngine` (RTL captions, −14 LUFS) |
| Observability | OpenTelemetry → Jaeger · Prometheus/Grafana · Loki · Sentry |
| Infra | Docker · Kubernetes · KEDA · Terraform · GitHub Actions |

## Quickstart (local)

```bash
pnpm install
docker compose up -d              # postgres+pgvector, redis, minio, mailpit, clamav, jaeger, bull-board
pnpm dev:bootstrap                # db push (until migrations land) + prisma client + plan seeds
pnpm dev                          # apps/api (:3000) today; web/worker boot lines land with those apps
```

Full, honest instructions (incl. what does **not** run yet): [`docs/DEVELOPER-GUIDE.md`](./docs/DEVELOPER-GUIDE.md).

Convenience: Jaeger UI `:16686` · MinIO console `:9001` · Mailpit `:8025` · Bull Board `:3030`.

## Repository layout

See [`docs/Folder-Structure.md`](./docs/Folder-Structure.md) — it is normative.
Required reads for contributors: `docs/Architecture.md` (system + ADRs),
`docs/Security.md` (non-negotiables), `docs/API.md` (contract rules).

## Contributing

Trunk-based, conventional commits (`feat(api): …`), PR checks: lint, typecheck,
unit, e2e, prompt-evals (for `packages/ai/prompts`), plugin-conformance, gitleaks,
Trivy, CodeQL. Design changes require an ADR in `docs/adr/` first.

## Security

See [`SECURITY.md`](./SECURITY.md). Never commit secrets — `.env.example`
documents every variable by name; values live in Doppler (prod) or `.env.local`
(dev, git-ignored).

## License

Proprietary — all rights reserved. Public SDK packages (`@autocreator/sdk`,
`@aca/plugin-kit`) will carry their own OSS licenses when published.
