# Workflow & Pipeline — v1.0-foundation

> Source of truth: `docs/AI-Pipeline.md` (agents, gates, retries),
> `docs/Contracts.md` C7 (workflow definition + agent contract), ADR-023
> (executor concurrency: optimistic `state_version` + run-hash sharding).
> Status: schema + contracts ✅ · executor runtime 🚧 (lands with the Workflow
> Engine module build).

## 1. Default system pipeline (15 core agents + optional localizer)

```mermaid
flowchart TD
    START(["video created / run started"]) --> TA["trend-analyzer"]
    TA --> IG["idea-generator"]
    IG --> SW["script-writer"]
    SW --> FC["fact-checker"]
    FC --> SEO["seo-optimizer"]
    SEO --> LOC{{"agent.localizer (opt-in, N languages)"}}
    LOC --> VG["voice-generator"]
    SEO --> SPL["scene-planner"]
    SPL --> AC["asset-collector"]
    VG --> VGen["video-generator"]
    AC --> VGen
    VGen --> SUB["subtitle-generator"]
    VGen --> TH["thumbnail-generator"]
    SUB --> QC{"quality-checker<br/>spell · factuality · audio LUFS/TP ·<br/>subtitle sync · render integrity ·<br/>originality pHash+cosine · policy tier · brand safety"}
    TH --> QC
    QC -->|all gates pass| PUB["publisher (memory-aware slotting)"]
    QC -->|gate fail → onFail policy| RETRY[["per-node retry budget /<br/>DAG-declared loopback"]]
    RETRY --> QC
    PUB --> ANA["analytics-collector"]
    ANA --> OPT["ai-optimizer (primary memory writer)"]
    OPT --> END(["report + memory delta → next runs improve"])

    MEM[["MemoryService compose topK=8<br/>channel→project→org scopes"]]
    MEM -.injected facts.-> IG & SW & SEO & TH
```

*Review-mode placement:* `REVIEW_SCRIPT` pauses after `fact-checker`;
`REVIEW_MEDIA` pauses after `asset-collector`; `REVIEW_FINAL` pauses after
`quality-checker`; `FULL_AUTO` has no user gate — but policy-tier hits force
`REVIEW_FINAL` regardless. Workflows without a QC node get an automatic
publish-time safety floor (launcher-injected; cannot be removed).

## 2. PipelineRun state machine (schema `RunStatus`, events from catalog)

```mermaid
stateDiagram-v2
    [*] --> PENDING : run created (workflow version pinned)
    PENDING --> RUNNING : aca.pipeline.run.started
    RUNNING --> RUNNING : step_completed / step_failed (budget left)
    RUNNING --> AWAITING_REVIEW : aca.pipeline.run.awaiting_review
    AWAITING_REVIEW --> RUNNING : review_approved
    AWAITING_REVIEW --> FAILED : review_rejected (terminal unless re-run)
    RUNNING --> PAUSED : operator pause (resume any time)
    PAUSED --> RUNNING : resume
    RUNNING --> COMPLETED : aca.pipeline.run.completed
    RUNNING --> FAILED : aca.pipeline.run.failed (budget exhausted)
    RUNNING --> CANCELLED : aca.pipeline.run.canceled
    PENDING --> CANCELLED : cancel before start
    COMPLETED --> [*]
    FAILED --> [*]
    CANCELLED --> [*]
```

Concurrency rule (ADR-023): a run row carries `state_version`; every
transition is an optimistic CAS update — executors shard runs by hash, so a
run is owned by exactly one executor at a time.

## 3. Workflow engine anatomy (Contract C7)

```mermaid
flowchart LR
    DEF["Workflow (editable)"] --> VER["WorkflowVersion<br/>(immutable DAG, published)"]
    VER --> RUN["PipelineRun (pins version)"]
    RUN --> STEPS["PipelineStepRun per DAG node<br/>agentKind · config · cost · memoryIds"]
    STEPS --> AGENT["PipelineAgent impl<br/>zod in/out · content-hash idempotency ·<br/>cost metering · qualityFloor"]
    AGENT --> ROUTER["ctx.route(capability, objective)<br/>cost-optimizing router — never below floor"]
    ROUTER --> PROV["AI provider adapters 🚧"]
    STEPS -->|evidence| LEDGER["credit ledger (micros) 🚧"]
```

**Key invariants:** runs pin an immutable workflow version (edits never mutate
live runs); node config overrides project `stylePreset` (config wins);
`gate.condition` pruning marks skipped dependents `SKIPPED` (excluded from
metering); agents never construct providers — routing only via `ctx.route`.
