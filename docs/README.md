# AutoCreator AI — Design Documentation

> **v2.0 — APPROVED** (Phase 1 + Phase 0.5 Final Architecture Review). This folder
> contains the complete engineering and business design of AutoCreator AI, extended
> with: tenancy v2 (teams/custom roles/white-label/custom domains), plugin system,
> workflow engine, event-driven backbone (outbox/inbox), AI memory, AI employees,
> cost-optimizing router, feature flags, enterprise controls (SSO/SAML/SCIM/IP
> allowlists), public developer platform (OAuth AS + SDK), marketplace, billing
> provider port, CDN-first media, and the 1M-user scale path.
>
> Phase 2 (build) is authorized and in progress. Design changes now go through
> the ADR process only (`docs/adr/NNNN-*.md`).

AutoCreator AI is an AI-native SaaS platform that fully automates the operation of
YouTube, TikTok and Instagram channels: trend research, ideation, scripting,
fact-checking, SEO, voiceover, scene planning, asset sourcing, video rendering,
subtitling, thumbnails, quality gates, scheduling, publishing, analytics, and a
closed-loop AI optimizer that improves every future video.

---

## Reading Order

| # | Document | Contents |
|---|----------|----------|
| 1 | [Architecture.md](./Architecture.md) | System context, container topology, NestJS vs Next.js API decision (ADR-001), monorepo strategy, queue architecture, scaling, reliability, observability, ADRs |
| 2 | [Database.md](./Database.md) | Full Prisma schema (35 models), ERD, indexing, partitioning, encryption-at-rest strategy, migrations, retention, GDPR erasure, capacity planning |
| 3 | [API.md](./API.md) | REST v1 conventions, complete endpoint reference (~95 endpoints), auth flows, WebSocket events, outbound webhooks, error model, rate limits, pagination |
| 4 | [Security.md](./Security.md) | Threat model, JWT session architecture, OAuth token vault (envelope encryption), RBAC matrix, rate limiting, SSRF/upload hardening, secrets management, compliance (GDPR, YouTube/TikTok/Instagram API ToS), CI security scans, incident response |
| 5 | [AI-Pipeline.md](./AI-Pipeline.md) | 15-agent pipeline specification, BullMQ FlowProducer orchestration, multi-provider AI abstraction (OpenAI / Anthropic / Google / OpenRouter / DeepSeek + TTS/image/stock providers), quality gates, review modes, cost accounting, feedback loop, per-video cost model |
| 6 | [Folder-Structure.md](./Folder-Structure.md) | Complete Turborepo monorepo tree (apps/web, apps/api, apps/worker + 11 shared packages), module boundaries, dependency rules, naming conventions |
| 7 | [Deployment.md](./Deployment.md) | Environments, local docker-compose stack, production topology (K8s + KEDA), Dockerfiles, GitHub Actions CI/CD, migrations, secrets, monitoring, backups/DR, monthly cost estimates |
| 8 | [Roadmap.md](./Roadmap.md) | Phases 0–6 (Aug 2026 → May 2027), deliverables per phase, exit criteria, external dependencies (platform API approvals), team plan, KPIs, risk register |
| 9 | [Business-Model.md](./Business-Model.md) | Market & competitor analysis, pricing tiers, AI credit economics, unit economics & gross margin, 3-year projections, GTM strategy, compliance-as-a-moat |
| 10 | [Validation-Report.md](./Validation-Report.md) | Adversarial architecture validation: cross-doc consistency audit, schema machine-verification (Prisma CLI), workflow scale math, plugin simulation, tenant leak analysis, performance/cost models, 12-attack red team — 25 amendments applied in v2.1 |
| 11 | [adr/README.md](./adr/README.md) | Master ADR index (001–023): decision · rationale · rejected alternatives · implementing code paths |
| 12 | [Dependency-Audit.md](./Dependency-Audit.md) | Layered workspace graph, machine-enforced acyclicity & drift gate, contracts-only import policy + transcripts |
| 13 | [Contracts.md](./Contracts.md) | **Frozen v1.0 public contracts** (events, plugins, AI providers, payments, storage, publisher, workflow, agents) + change/versioning policy |
| 14 | [Failover-Plan.md](./Failover-Plan.md) | Failure-injection playbooks for AI/Redis/PG/FFmpeg/S3/OAuth/payments with recovery semantics and chaos schedule |
| 15 | [Testing-Strategy.md](./Testing-Strategy.md) | Risk-weighted coverage gates, 12 golden e2e journeys, load/chaos/security batteries, honest non-100% policy |
| 16 | [Engineering-Standards.md](./Engineering-Standards.md) | Definition of Done (12 boxes), the 9 merge-blocking CI gates, branch protection, commit conventions |

---

## Conventions Used In These Documents

- **Diagrams:** Mermaid (renders natively on GitHub).
- **Money:** All monetary values in minor units (cents). AI costs in *micros* (1/1,000,000 USD).
- **IDs:** UUIDv7 (time-ordered, index-friendly).
- **Timestamps:** `timestamptz`, UTC everywhere; user-facing conversion in the client.
- **API versioning:** Path-based (`/v1`), never header-based.
- **Architecture changes:** Any deviation from these documents requires an ADR
  added to `docs/adr/` (format: `NNNN-title.md`) *before* implementation.

## Document Status

| Document | Status |
|----------|--------|
| All 9 documents | ✅ Complete — awaiting owner approval to start Phase 2 (build) |
