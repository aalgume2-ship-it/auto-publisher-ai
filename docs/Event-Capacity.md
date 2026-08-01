# Event Backbone — Capacity Model (10k / 100k / 1M jobs per day)

**Status: engineered capacity MODEL, not benchmark claims.** Numbers below are
computed from stated assumptions + formulas; they become acceptance criteria
for the Phase-1 load test (`infra/load/events-bench.ts`, Testing-Strategy §9)
that MUST validate or correct this table before launch claims are made. Any
number here later contradicted by measurement must be edited in the same PR
that lands the measurement.

## 1. Assumptions (declared, tune inputs to recompute)

| Symbol | Value | Basis |
|---|---|---|
| E/job | **35 events per job** | 15 step_completed + started/completed + video.generated + 3 publishing + ~8 ai_team messages + 2 memory + 2 optimizer + 1 analytics + misc (counted against the catalog) |
| S_env | **1.2 KB** avg serialized v1.1 envelope (range 0.8–2 KB) | uuid-heavy envelope + small payloads |
| Domains | 11 logical streams × 64 slots | Architecture §7.3 N=64 |
| Relay baseline | batch 500 / 2 s (hot poll 100 ms on full batches) | defaults (relay.batchSize/pollMs) |
| Fleet fanout | avg 3 consumer groups per event | catalog consumers column |
| Retention | published rows pruned 72 h; `processed_events` 30 d; DLQ 90 d | Database.md §9 |

Derived: `events/s E(t) = jobs/day ÷ 86 400 × 35` · journal volume `V = E × 86 400 × S_env`.

## 2. Load model

| Scale | jobs/s | events/s (E) | events/day | journal/day | PG outbox live set (72 h) |
|---|---|---|---|---|---|
| **10k/day** | 0.116 | 4.1 | 350 k | ~420 MB | ~1.1 M rows ≈ 1.3 GB |
| **100k/day** | 1.16 | 41 | 3.5 M | ~4.2 GB | ~10.5 M rows ≈ 13 GB |
| **1M/day** | 11.6 | 405 | 35 M | ~42 GB | ~105 M rows ≈ 126 GB |

## 3. Component saturation

| Component | 10k/day | 100k/day | 1M/day |
|---|---|---|---|
| **Relay claim rate** (batch 500/2 s ⇒ 250 rows/s/replica) | 1.6 % | 16 % | **162 % → scale**: batch 1000 + poll 1 s (=500/s) **or 2 replicas** (SKIP-LOCKED linear), headroom ≥ 2× |
| **Relay p99 mark latency** | ~1 s (poll-bound) | ~1.2 s | ~2–4 s at saturation tuning above |
| **Redis XADD ops** (peak stream: `events:pipeline` ≈ 45 % of E) | ~2/s | ~18/s | ~180/s — vs ~100k ops/s class ceiling: **< 0.2 %** |
| **Redis resident memory** (steady state = E × residency, minutes) | ~0.3 MB | ~3 MB | ~30 MB — MAXLEN is a worst-case bound only, never reached at healthy lag |
| **Bus deliveries** (E × fleet fanout 3) | 12/s | 123/s | ~1 215/s across groups — consumer replica count is handler-latency-bound, not bus-bound |
| **PG write IOPS** (outbox insert + mark + dedup + cursor: 4 writes/event × E) | ~16/s | ~164/s | ~1 620/s — well inside a healthy PG 16 primary; at 1M/day the outbox insert is the #1 write hotspot by design |
| **Lag sampling** (XINFO × 64 slots × 11 domains / 15 s) | ~47 calls/s equivalent amortized | same | same (constant) |

## 4. End-to-end latency budget (modeled, healthy system)

| Hop | 10k/day | 100k/day | 1M/day |
|---|---|---|---|
| produce-commit visible in outbox | 0 (same tx) | 0 | 0 |
| relay claim → XADD (p50 / p99) | ~0.6 s / ~1.5 s | ~0.7 s / ~2 s | ~1.2 s / ~4 s |
| XREADGROUP dispatch delay | ~5 ms / ~50 ms | ~10 ms / ~80 ms | ~25 ms / ~150 ms |
| handler p50 (consumer-dependent) | profile-per-consumer | — | — |
| **event-visible-to-side-effect p99** | **≈ 2 s** | **≈ 2.5 s** | **≈ 5 s** |

## 5. Scaling inflection points (planned, not reactive)

1. **≈ 40k jobs/day:** relay batch 1000 + poll 1 s (config flip).
2. **≈ 250k jobs/day:** 2 relay replicas; outbox weekly partition automation on
   schedule (retention doc); `processed_events` partition prune job.
3. **≈ 600k jobs/day:** consumer groups reach one-node handler CPU at heavy
   consumers (notifications/webhooks); add replicas per group (ordering per
   slot is preserved — entries of one slot race between replicas but dedup is
   idempotent and the entry lock is the pending entry itself).
4. **≈ 1M/day sustained:** stage-B Kafka flip (flag `kafka.eventbus`, ADR-009)
   behind IEventBus with identical semantics; outbox journal moves to reader
   replicas for replay; PG primary write budget reviewed (this model's hotspot).

## 6. Sensitivity

- Envelope size 2 KB (large payloads) ⇒ journal/day ×1.7 and PG IOPS unchanged;
  consider payload caps for chatty aggregates (already bounded by catalog
  schemas — max fields enforced at write).
- shardCount 64→128: per-slot keyspace doubles (lag sampling cost ×2); needed
  only if per-slot ordering contention is measured (not modeled as binding).
- Fanout ×5 (new consumers): deliveries scale linearly; add group replicas not
  bus capacity.

## 7. Validation plan (how these numbers get proven)

1. `infra/load/events-bench.ts` — synthetic producer writing N jobs worth of
   catalog-valid events at fixed rate; measures relay p99, consume latency,
   dedup correctness under forced duplicate injection, DLQ rate.
2. Chaos slices: kill relay mid-cycle, flush Redis, kill consumer pre/post
   commit — asserted by extending `test/integration/backbone.spec.ts`.
3. Acceptance: p99 side-effect latency ≤ 2 × the modeled value at 100k/day on
   staging hardware class; journal growth matches §2 within ±20 %.
