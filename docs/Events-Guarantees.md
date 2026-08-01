# Events — Delivery Guarantees & System Boundaries (normative, ADR-024)

This document states **exactly** what the platform guarantees — and what it
deliberately does not. Every claim below is backed by a mechanism implemented
in `packages/events` and asserted by a test.

## 1. The guarantee ladder

| # | Guarantee | Mechanism | Where | Test |
|---|---|---|---|---|
| G1 | **No loss between domain state and the log (atomic)** | `outbox_events` inserted in the SAME PG transaction as the domain change (`OutboxWriter`) | All producers | `test/integration/backbone.spec.ts` #1 |
| G2 | **At-least-once transport delivery** | Relay claims via `FOR UPDATE SKIP LOCKED`, XADDs, then marks `publishedAt`; crash ⇒ row retried. Unpublished rows are re-scanned forever | `OutboxRelay` | integration #1, #4 |
| G3 | **Effectively-once processing per (consumer, event)** | `(consumer, eventId)` dedup row + handler's domain writes + consumer-cursor checkpoint commit in ONE PG tx; XACK after commit | `runWithInboxDedup`, `ConsumerRunner` | integration #2, #3 |
| G4 | **Per-aggregate ordering** | `fnv1a32(aggregateId) % 64` slot routing; one aggregate ⇒ one physical stream ⇒ append order | `shards.ts` | `test/shards.spec.ts` |
| G5 | **Nothing is lost on Redis flush/failover** | Truth is PG: outbox journal replays (`replayFromOutbox`); groups recreated from `consumer_cursors` at start | `replay.ts`, `ConsumerRunner.start` | integration #5 |
| G6 | **Poison messages cannot stall a partition** | Stream processing has no head-of-line blocking for failing entries (they stay pending; sweep handles by maturity); after `maxAttempts` → durable DLQ + XACK | `ConsumerRunner.sweep`, `dlq.ts` | integration #4 |
| G7 | **Contract invalid events never enter the log** | Catalog zod validation at write time (`EventContractError`) | `envelope.ts` | `test/envelope.spec.ts` |

## 2. Exactly-once — what it precisely means here

**Inside the platform (PG state transitions): EXACTLY-ONCE per (consumer, eventId).**
A consumer's state transition caused by an event commits atomically with its
dedup marker; redelivery is impossible to observe as a duplicate effect.
This holds against: relay restarts, consumer crashes, Redis group-state loss,
message duplicates at the transport, retries, and DLQ replays of the original id.

**At the edge (external systems): AT-LEAST-ONCE — by physics, not by flaw.**
An external side effect (YouTube upload, Resend email, webhook POST, Stripe
call) happens outside our transaction boundary; a crash between the external
call and the commit can duplicate it. Mitigation is contractual, not
transactional:

| Consumer class | Examples | Mitigation owner | Mechanism |
|---|---|---|---|
| Publisher adapters | `publishing.*` → YouTube/TikTok/IG upload | `packages/ai` publisher adapters | provider idempotency/resumable-upload session keys; `publishing_tasks` row reconciles via `fetchVideoMetrics`/platform listing |
| Email | notifications fan-out | `packages/email` | provider idempotency key = `eventId` |
| Webhooks-out | developer deliveries | apps/worker webhooks consumer | delivery row keyed by `(endpointId, eventId)`; receiver-side dedup documented in API.md |
| Payments | Stripe webhook ingestion | `packages/billing` | `externalRef` uniqueness + `syncSubscription` pull-reconciliation |

## 3. At-least-once surfaces that stay (and why they're safe)

| Surface | Duplicate risk | Why safe |
|---|---|---|
| Redis stream entries after relay crash | Duplicate XADD of same envelope | Inbox dedup (G3) |
| `events:dlx:<domain>` mirror | Informational copy only — **never the DLQ truth** | Truth = `dead_letter_events` (PG) |
| Consumer cursor vs group position drift after force-failover | At-most one in-flight batch re-read | Dedup + idempotency |
| Replay re-delivery | Original ids re-appended | Dedup for untouched consumers; explicit scoped rebuild for the target consumer |

## 4. Explicitly NOT guaranteed (honest boundaries)

1. **Global ordering across aggregates/domains** — ordering is per-aggregate only
   (by design; cross-aggregate causality travels via `causationId` and is
   reconstructed by the orchestrator, not by the bus).
2. **Exactly-once external side effects** — impossible without vendor-side tx
   participation; see §2.
3. **Bounded end-to-end latency under partition** — PG partition stalls the
   outbox relay (events queue in the tx's own database — never lost; latency
   degrades, correctness holds).
4. **Retention beyond policy** — `outbox_events` rows are deleted 72 h after
   `published_at` (weekly partitions). Replays older than that need the
   archive/export path (CLI), not `replayFromOutbox`.
5. **Duplicate-free reads of `processed_events`-less consumers** — a consumer
   that bypasses `runWithInboxDedup` (forbidden by policy; lint reviewed) has no
   dedup protection.
6. **Multi-entity atomic fanout across separate aggregates isn't serialized by the bus** —
   sagas/compensations are workflow-level concerns (ADR-011), not transport guarantees.

## 5. Failure-mode matrix (summary — full flowcharts in docs/Event-Flows.md)

| Failure | Window of risk | Outcome |
|---|---|---|
| Producer crash mid-tx | tx open | Nothing written anywhere (atomic tx) |
| Producer crash after commit, before relay reads | durable | Relay picks it up next poll (≤ 2 s) |
| Relay crash between XADD and mark-published | one row | Duplicate XADD next poll → dedup absorbs |
| Redis flush/failover | group state lost | Groups recreated from PG cursors; streams refill from relay backlog + replay |
| Consumer crash before commit | one entry | Entry stays pending → swept after backoff |
| Consumer crash after commit, before XACK | one entry | Redelivery → dedup hit → XACK only |
| Handler throws 10× (budget exhausted) | one entry | Durable DLQ row + XACK + metric; partition unaffected |
| DLQ replay after bugfix | original id | Re-entered; untouched consumers dedup; target consumer rebuilt via scoped procedure |
