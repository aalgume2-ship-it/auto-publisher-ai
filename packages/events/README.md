# @aca/events — Event Backbone (ADR-024)

PostgreSQL is the only source of truth. Redis Streams is transport.

```
producer tx ──▶ outbox_events (PG) ──relay──▶ events:<domain>:<slot> (Redis)
                     ▲   │                            │
                     │   └─ replay source of truth    ▼
                     │                         consumer group ──▶ handler
                     │                            │   (dedup row + domain
                     │                            │    writes + cursor in ONE tx)
                     └──────── DLQ: dead_letter_events (PG) ◀── after maxAttempts
```

## Guarantees (docs/Events-Guarantees.md is normative)

- **Effectively-once** per `(consumer, eventId)`: dedup row and the consumer's
  domain writes commit in the same transaction.
- **At-least-once** transport (relay crash may duplicate XADDs; Redis may lose
  group state) — harmless: inbox dedup + PG cursors.
- **External world is at-least-once** (YouTube uploads, emails, webhook
  deliveries): provider idempotency keys + reconciliation, owned per service.

## Usage

```ts
import { createOutboxWriter, OutboxRelay, ConsumerRunner, RedisStreamsBus, resolveEventsConfig } from '@aca/events';
import { createPrismaClient } from '@aca/database';

// producer (inside a domain transaction)
const outbox = createOutboxWriter('apps/api');
await db.$transaction(async (tx) => {
  const run = await tx.pipelineRun.create({ data: /* … */ });
  await outbox.write(tx, [{ type: 'aca.pipeline.run.started', orgId, aggregateType: 'PipelineRun', aggregateId: run.id, payload }]);
});

// infra (worker process)
const bus = new RedisStreamsBus({ url, shardCount: 64, streamMaxLen: 1_000_000 });
const relay = new OutboxRelay({ db, bus, metrics, logger, config, producer: 'relay-0' });
relay.start();

const consumer = new ConsumerRunner({
  db, bus, metrics, logger, group: 'notifications', consumerName: 'notifications-0',
  streams: ['events:publishing'], config: ConsumerConfigSchema.parse({}),
  handler: async (env, tx) => { /* domain writes via tx */ },
});
await consumer.start();
```

## Ops procedures

- **Replay:** `replayFromOutbox(db, bus, { type | aggregateId | orgId | from/to, limit })`
  — re-delivers ORIGINAL envelope ids from the PG journal.
- **Scoped rebuild:** `deleteProcessedForScope(db, { consumer, eventIds, limit })`
  then replay — only that consumer re-processes.
- **Redis flush recovery:** consumer groups are recreated from
  `consumer_cursors` at `ConsumerRunner.start()` automatically.
- **DLQ:** `dead_letter_events` rows start `OPEN`; replay sets `REPLAYED` (or
  `DISCARDED` for poison). Mirror stream `events:dlx:<domain>` is notification
  surface only.

## Config (env → EventsConfigInput)

| Env | Field | Default |
|---|---|---|
| `EVENTS_REDIS_URL` | redisUrl | — (required) |
| `EVENTS_SHARD_COUNT` | shardCount | 64 |
| `EVENTS_STREAM_MAXLEN` | streamMaxLen | 1 000 000 |
| `EVENTS_RETRY_MAX_ATTEMPTS` | retry.maxAttempts | 10 |
| `EVENTS_RETRY_BASE_MS` | retry.baseMs | 1000 |
| `EVENTS_RETRY_MAX_MS` | retry.maxMs | 900 000 |
| `EVENTS_RELAY_BATCH` | relay.batchSize | 500 |
| `EVENTS_RELAY_POLL_MS` | relay.pollMs | 2000 |

## Tests

- `pnpm test` — unit suite (31 tests, no infra).
- `ACA_EVENTS_IT=1 pnpm test:integration` — REAL Postgres + Redis
  (docker compose data plane, `.env.example` names): outbox→relay round-trip,
  effectively-once commit/rollback, DLQ, bus primitives, replay.
