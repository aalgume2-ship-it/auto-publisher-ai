# AutoCreator AI

**Autonomous, AI-native operation of YouTube, TikTok and Instagram channels** —
trend research → ideation → script → fact-check → SEO → voiceover → scenes →
assets → render → subtitles → thumbnails → quality gates → scheduling →
publishing → analytics → a learning loop that remembers what works on every
channel.

This repository contains the full platform: web app, public REST API,
workflow executor, plugin runtime, and all shared packages of the monorepo.

## Status

**Phase 2 — build in progress** (design v2.0 approved; see [`docs/`](./docs)).
Architecture is documented and frozen under ADR governance; consult
[`docs/Architecture.md`](./docs/Architecture.md) before making design-level changes.

## Stack

| Area | Choice |
|------|--------|
| Monorepo | Turborepo + pnpm workspaces |
| Web | Next.js 15 · React 19 · Tailwind 4 · shadcn/ui · TanStack Query · next-intl (en/ar) |
| API | NestJS 10 (Fastify) · REST /v1 · OpenAPI 3.1 · Socket.IO · OAuth 2.0 AS · SCIM |
| Data | PostgreSQL 16 (+pgvector) · Prisma 5 · Redis 7 (BullMQ + event streams + cache) · S3 behind CloudFront |
| AI | Plugin-bound multi-provider capabilities (OpenAI · Anthropic · Google · OpenRouter · DeepSeek · ElevenLabs …) with cost-optimizing router |
| Video | FFmpeg 7 behind `IVideoEngine` (RTL captions, −14 LUFS) |
| Observability | OpenTelemetry → Jaeger · Prometheus/Grafana · Loki · Sentry |
| Infra | Docker · Kubernetes · KEDA · Terraform · GitHub Actions |

## Quickstart (local)

```bash
pnpm install
docker compose up -d              # postgres+pgvector, redis, minio, mailpit, clamav, jaeger, bull-board
pnpm dev:bootstrap                # migrate + seed (plans, system workflow, personas, voices, plugins, flags)
pnpm dev                          # web :3000 · api :4000 · worker · worker-plugins
```

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
