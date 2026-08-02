# System Architecture — v1.0-foundation (Final)

> Normative design view (docs/Architecture.md) annotated with **build status at tag
> `v1.0-foundation`**: ✅ built & CI-green · 🚧 designed, not scaffolded yet.
> Renders natively on GitHub (Mermaid).

```mermaid
flowchart TB
    subgraph Clients["Clients"]
        WEB["apps/web — Next.js console 🚧"]
        SDK["Public SDK / partner apps 🚧"]
    end

    subgraph Edge["Edge"]
        CDN["CDN (media, CDN-first ADR-019) 🚧"]
        LB["Load balancer / ingress 🚧"]
    end

    subgraph API["apps/api — NestJS 11 + Fastify 5 modular monolith ✅ foundation"]
        direction TB
        RC["RequestContext middleware ✅<br/>(req/corr/org/user/trace ids)"]
        GUARDS["Guard chain ✅<br/>Auth · Tenant · RBAC · Entitlements · Credits"]
        RL["Rate limiting ✅ (Redis sliding window)"]
        IDEM["Idempotency ✅ (PG-backed)"]
        MODS["Feature modules 🚧<br/>organizations · users · channels · publishing …"]
        HEALTH["/health · /health/ready · /health/live ✅"]
        OPENAPI["OpenAPI /docs + /openapi.json ✅ shell"]
    end

    subgraph Workers["apps/worker fleets 🚧"]
        ORCH["Orchestrator (BullMQ FlowProducer) 🚧"]
        PIPE["Pipeline agents ×15 🚧<br/>trend→idea→script→seo→scenes"]
        RENDER["Render workers 🚧"]
        PUBW["Publishing workers 🚧"]
        ANW["Analytics / optimizer / memory 🚧"]
    end

    subgraph Data["Data plane"]
        PG[("PostgreSQL 16 + pgvector ✅ schema (72 models)<br/>outbox · inbox · DLQ · cursors")]
        REDIS[("Redis 7.4 ✅<br/>queues · rate limits · dedup windows")]
        S3[("Object storage (S3/MinIO) 🚧<br/>assets · renders · logs")]
    end

    subgraph AI["AI providers (port adapters, ADR zero-lock-in) 🚧"]
        LLM["LLM router<br/>OpenAI · Anthropic · Google · OpenRouter · DeepSeek"]
        TTS["TTS / voice"]
        IMG["Image / stock media"]
    end

    subgraph VideoEngine["packages/video-engine 🚧"]
        FFMPEG["FFmpeg 7 behind IVideoEngine (ADR-005)<br/>RenderJobSpec · specHash idempotency"]
    end

    subgraph Publishing["Publishing (publisher-client port C6) 🚧"]
        YT["YouTube"]
        TT["TikTok"]
        IG["Instagram"]
    end

    subgraph Monitoring["Monitoring & observability"]
        OTEL["OpenTelemetry traces ✅ (OTLP export)"]
        PROM["Prometheus /metrics ✅"]
        JAE["Jaeger backend (compose) ✅ dev"]
        LOGS["pino structured logs ✅"]
        BB["Bull Board (compose) ✅ dev"]
    end

    WEB --> LB --> RC
    SDK --> LB
    CDN --> S3
    WEB -.->|"media playback (origin never client-visible, ADR-019)"| CDN

    RC --> GUARDS --> RL --> IDEM --> MODS
    MODS --> PG
    RL --> REDIS
    MODS -->|"transactional outbox write ✅"| PG
    PG -->|"outbox relay ✅"| REDIS
    REDIS --> ORCH
    ORCH --> PIPE --> LLM
    PIPE --> IMG
    PIPE --> TTS
    PIPE --> FFMPEG
    FFMPEG --> S3
    ORCH --> PUBW --> YT & TT & IG
    PUBW --> ANW
    ANW --> PG
    ANW -->|"memory + optimizer events"| REDIS

    API -.traces.-> OTEL
    Workers -.traces.-> OTEL
    OTEL --> JAE
    API -.scraped.-> PROM
    LOGS --- API
    BB --> REDIS

    classDef built fill:#d3f9d8,stroke:#2b8a3e,color:#000
    classDef planned fill:#fff3bf,stroke:#e8a100,color:#000,stroke-dasharray:5 5
    class RC,GUARDS,RL,IDEM,HEALTH,OPENAPI,PG,REDIS,OTEL,PROM,JAE,LOGS,BB built
    class WEB,SDK,CDN,LB,MODS,ORCH,PIPE,RENDER,PUBW,ANW,S3,LLM,TTS,IMG,FFMPEG,YT,TT,IG planned
```

## Reading the diagram

| Component | Status at v1.0 | Notes |
|---|---|---|
| **Web** (`apps/web`) | 🚧 planned | Next.js console; consumes `/v1` + OpenAPI SDK only |
| **API** (`apps/api`) | ✅ foundation | All cross-cutting layers built; zero business controllers yet |
| **Workers** (`apps/worker`) | 🚧 planned | Orchestrator + agent/render/publish/analytics fleets; consume events only |
| **Redis** | ✅ integrated | Rate limits + events backbone in use; BullMQ lands with worker app |
| **PostgreSQL** | ✅ schema complete | 72 models; outbox/inbox/DLQ tables already serving `@aca/events` |
| **Storage** | 🚧 planned | MinIO in local compose; `IStoragePort` frozen in Contracts C5 |
| **AI providers** | 🚧 planned | Contracts C3 frozen; adapters land in `@aca/ai` (layer 4) |
| **Video engine** | 🚧 planned | FFmpeg 7 behind `IVideoEngine` (ADR-005) |
| **Publishing** | 🚧 planned | Publisher port C6 (YouTube/TikTok/Instagram clients) |
| **Monitoring** | ✅ wired in API | OTel traces, Prometheus `/metrics`, pino logs; Jaeger/Bull Board in local stack |

**Invariants shown:** writes cross the API→PG boundary inside one transaction together
with their outbox rows (✅ implemented); workers never call the API — they consume
events; the media origin (S3) is never client-visible (ADR-019).
