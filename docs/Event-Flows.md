# Event Flows — Diagrams (ADR-024)

Authoritative diagrams for the events backbone. Rendered as Mermaid (editable
in-repo). Numbers in parentheses reference guarantees in
docs/Events-Guarantees.md.

## 1. Event flow (producer → truth → transport → consumers → DLQ)

```mermaid
flowchart LR
  subgraph PROD[Producer (apps/api · apps/worker)]
    S[Domain state change]
    W[OutboxWriter.write tx]
    S --> W
  end

  subgraph PG[(PostgreSQL — SOURCE OF TRUTH)]
    O[(outbox_events<br/>full v1.1 envelope JSON)]
    P[(processed_events<br/>consumer · eventId)]
    C[(consumer_cursors<br/>consumer · stream → slot ids)]
    D[(dead_letter_events<br/>OPEN / REPLAYED / DISCARDED)]
  end

  subgraph RELAY[Outbox Relay ×2]
    R1[claim batch<br/>FOR UPDATE SKIP LOCKED<br/>500 rows / 2 s]
  end

  subgraph REDIS[Redis Streams — transport only]
    S1[(events:&lt;domain&gt;:000..063<br/>64 slots by fnv1a aggregateId % N)]
    G1[consumer group: notifications]
    G2[consumer group: orchestrator]
  end

  subgraph CONS[Consumers]
    H1[handler ①]
    H2[handler ②]
    SW[sweeper: pending maturity<br/>idle ≥ backoff deliveries]
  end

  W -->|same-tx insert G1| O
  O --> R1 -->|XADD → mark published_at G2| S1
  S1 --> G1 --> H1
  S1 --> G2 --> H2
  H1 -->|dedup row + domain writes + cursor in ONE tx G3| P
  H1 --> C
  SW -->|fail ≤ maxAttempts| H1
  SW -->|budget exhausted G6| D
  D -.->|replay original id| R1
```

## 2. Sequence — one video, idea → publish (single trace via traceparent propagation)

```mermaid
sequenceDiagram
  autonumber
  participant AP as Autopilot (api/worker)
  participant TX as PG tx + outbox
  participant R as Relay
  participant B as Redis bus (events:pipeline:*)
  participant OR as Orchestrator
  participant AG as Agent step (worker)
  participant PU as Publisher svc
  participant J as Jaeger

  AP->>TX: run STARTED + outbox(aca.pipeline.run.started)<br/>correlationId = run.id
  Note over AP,J: span A (trace t₀) → traceparent into metadata
  TX-->>R: committed row
  R->>B: XADD slot(run.id % 64)
  B-->>OR: XREADGROUP (cg: orchestrator)
  OR->>TX: dedup + advance DAG + cursor ① tx
  OR->>B: XACK
  OR->>TX: enqueue step → outbox(step span t₀·A1 traceparent)
  Note over AG,J: span A1 child of A (W3C extraction)
  AG->>TX: dedup + agent work + outbox(run.step_completed, causationId=started.id)
  AG->>B: XACK after commit G3
  loop 15 steps
    OR->>AG: next node(s) (same trace t₀)
    AG->>B: step_completed chain (causationId links parents)
  end
  OR->>TX: dedup + outbox(run.completed) → outbox(publishing.task.scheduled)
  R->>B: XADD events:publishing:*
  B-->>PU: publish.started
  PU->>AP: /chapters POST (external effect — at-least-once §2)
  PU->>TX: dedup + outbox(publish.completed, trace t₀)
  J-->>J: one tree: idea … publish.completed (requirement §8)
```

## 3. Failure recovery — state machines

```mermaid
flowchart TB
  subgraph RelayCrash{Relay crash between XADD and mark-published}
    A1[row re-claimed next poll] --> A2[XADD DUPLICATE<br/>same envelope id] --> A3[consumer: dedup hit →<br/>XACK, no side effects G3]
  end

  subgraph ConsumerCrash{Consumer crash timeline}
    B1[crash BEFORE commit<br/>entry pending] --> B3
    B2[crash AFTER commit<br/>before XACK] --> B4[redelivery → dedup hit<br/>→ XACK only]
    B3[sweeper waits idle ≥<br/>backoff deliveries] --> B5{matured?}
    B5 -->|yes, deliveries < 10| B6[claim → reprocess]
    B5 -->|deliveries ≥ 10| B7[dead_letter_events OPEN<br/>+ XACK + metric]
  end

  subgraph RedisLoss{Redis flush / failover}
    C1[group state gone] --> C2[ConsumerRunner.start:<br/>recreate groups FROM<br/>consumer_cursors PG G5]
    C2 --> C3[streams dry? relay backlog<br/>(72 h retention) +<br/>replayFromOutbox filters]
  end

  subgraph DLQReplay{DLQ lifecycle}
    D1[OPEN row<br/>90 d window] --> D2{bug fixed?}
    D2 -->|replay tool| D3[re-append ORIGINAL id<br/>untouched consumers dedup]
    D2 -->|poison| D4[DISCARDED]
    D3 --> D5[REPLAYED + replayedAt]
  end
```

---

Reading notes:
- No arrow crosses PG↔Redis except through the relay — this is the physical
  encoding of "Redis is transport, never truth".
- The DLQ actuator replays **original envelope ids**; duplicate suppression is
  owned by inbox dedup, not by inventing new ids.
