/**
 * REAL-INFRASTRUCTURE backbone tests (no fakes): PostgreSQL 16 + Redis 7 from
 * the repo docker-compose data plane. Gated by ACA_EVENTS_IT=1 so unit runs
 * stay infra-free; CI runs this file against compose services.
 *
 * Covered end-to-end:
 *   1. outbox write (in-tx) → relay → sharded stream round-trip + publishedAt
 *   2. effectively-once: dedup row + domain write share a tx (commit/rollback)
 *   3. failing handler keeps the event re-processable; retry budget → DLQ row
 *   4. bus primitives on real Redis (group create/read/ack/pending/claim/lag)
 *   5. cursor-bootstrap after group wipe, replayFromOutbox re-delivery
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type DbClient } from '@aca/database';
import { EventEnvelopeSchema, eventStreamForType } from '@aca/shared';
import { OutboxWriter } from '../../src/outbox-writer.js';
import { OutboxRelay } from '../../src/relay.js';
import { RedisStreamsBus } from '../../src/adapters/redis-streams-bus.js';
import { readCursor, runWithInboxDedup } from '../../src/dedup.js';
import { writeDeadLetter } from '../../src/dlq.js';
import { replayFromOutbox } from '../../src/replay.js';
import { NoopEventsMetrics } from '../../src/metrics.js';
import { resolveEventsConfig, ConsoleLogger } from '../../src/types.js';
import { streamKey, shardSlotForAggregate } from '../../src/shards.js';
import { buildEnvelope } from '../../src/envelope.js';

const IT = process.env.ACA_EVENTS_IT === '1';
const logger = new ConsoleLogger('events-it');
const config = resolveEventsConfig({
  redisUrl: process.env.ACA_REDIS_URL ?? 'redis://localhost:6379/3',
  shardCount: 4,
  streamMaxLen: 100_000,
});

const V7 = (suffix: string): string => `0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e${suffix}`;

/** Bounded readiness poll for clients created with enableOfflineQueue:false. */
async function waitForRedisReady(
  redis: { ping(): Promise<string>; status: string },
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    if (redis.status === 'ready') return;
    try {
      await redis.ping();
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(
    `redis not ready within ${timeoutMs}ms (status=${redis.status}, last error=${lastError instanceof Error ? lastError.message : String(lastError)})`,
  );
}

describe.skipIf(!IT)('events backbone (real postgres + redis)', () => {
  let db: DbClient;
  let bus: RedisStreamsBus;
  let writer: OutboxWriter;
  let relay: OutboxRelay;
  const metrics = new NoopEventsMetrics();
  const STREAM = eventStreamForType('aca.flags.changed');

  beforeAll(async () => {
    db = createPrismaClient();
    bus = new RedisStreamsBus({ url: config.redisUrl, shardCount: config.shardCount, streamMaxLen: config.streamMaxLen, logger });
    // The bus deliberately uses enableOfflineQueue:false (fail fast in prod);
    // the suite must therefore wait for the handshake before issuing commands —
    // poll PING until the server answers (bounded).
    await waitForRedisReady(bus.redis, 15_000);
    await bus.redis.flushdb();
    writer = new OutboxWriter({ producer: 'apps/api' });
    relay = new OutboxRelay({
      db,
      bus,
      metrics,
      logger,
      config: { batchSize: 100, pollMs: 250, hotPollMs: 10 },
      producer: 'it',
    });
    await db.$executeRawUnsafe('TRUNCATE outbox_events, processed_events, dead_letter_events, consumer_cursors');
  }, 60_000);

  afterAll(async () => {
    await relay?.stop();
    await bus?.quit();
    await db?.$disconnect();
  });

  it('1. outbox write → relay → sharded stream envelope round-trip', async () => {
    const payload = { key: 'it.flag', to: true, scope: 'GLOBAL' as const };
    const written = await db.$transaction(async (tx) => {
      return writer.write(tx, [
        { type: 'aca.flags.changed', orgId: null, aggregateType: 'FeatureFlag', aggregateId: 'it.flag', payload },
      ]);
    });
    expect(written).toHaveLength(1);
    const delivered = await relay.runOnce();
    expect(delivered).toBe(1);

    const row = await db.outboxEvent.findUniqueOrThrow({ where: { id: written[0]!.id } });
    expect(row.publishedAt).not.toBeNull();

    const slot = shardSlotForAggregate('it.flag', config.shardCount);
    const key = streamKey(STREAM, slot, config.shardCount);
    const raw = await bus.redis.xrange(key, '-', '+');
    expect(raw.length).toBe(1);
    const stored = JSON.parse((raw[0] as [string, string[]])[1][1] as string) as unknown;
    expect(EventEnvelopeSchema.safeParse(stored).success).toBe(true);
    expect((stored as { correlationId: string }).correlationId).toBe(written[0]!.id);
  });

  it('2. dedup row + domain write share one tx — processed once, duplicate skipped', async () => {
    const env = buildEnvelope(
      { type: 'aca.flags.changed', orgId: null, aggregateType: 'FeatureFlag', aggregateId: 'it.dedup', payload: { key: 'it.dedup', to: 1, scope: 'GLOBAL' } },
      { producer: 'it' },
    );
    let handlerRuns = 0;
    const handler = async (tx: unknown): Promise<void> => {
      handlerRuns += 1;
      // real domain write (marker row already-published so the relay ignores it)
      await (tx as DbClient).outboxEvent.create({
        data: {
          id: `0190844f-9f2e-7c3a-9b1d-2f8f6a1c49${String(40 + handlerRuns)}`,
          orgId: null,
          aggregateType: 'it-marker',
          aggregateId: env.id,
          type: 'aca.flags.changed',
          version: 1,
          payload: env as never,
          occurredAt: new Date(),
          publishedAt: new Date(),
        },
      });
    };

    const first = await runWithInboxDedup(
      db,
      { consumer: 'cg-it', stream: STREAM, slot: 0, entryId: '1-0', envelope: env },
      handler,
    );
    expect(first.status).toBe('processed');
    expect(handlerRuns).toBe(1);

    const second = await runWithInboxDedup(
      db,
      { consumer: 'cg-it', stream: STREAM, slot: 0, entryId: '1-1', envelope: env },
      handler,
    );
    expect(second.status).toBe('duplicate');
    expect(handlerRuns).toBe(1); // not re-run

    const cursor = await readCursor(db, 'cg-it', STREAM);
    expect(cursor['0']).toBe('1-1'); // checkpointed on the second (deduped) pass too
  });

  it('3. handler failure rolls back dedup+domain writes → event re-processable', async () => {
    const env = buildEnvelope(
      { type: 'aca.flags.changed', orgId: null, aggregateType: 'FeatureFlag', aggregateId: 'it.rollback', payload: { key: 'it.rollback', to: 2, scope: 'GLOBAL' } },
      { producer: 'it' },
    );
    let attempts = 0;
    await expect(
      runWithInboxDedup(
        db,
        { consumer: 'cg-it', stream: STREAM, slot: 1, entryId: '2-0', envelope: env },
        async () => {
          attempts += 1;
          throw new Error('deliberate failure');
        },
      ),
    ).rejects.toThrow('deliberate failure');
    expect(attempts).toBe(1);
    // nothing committed: neither dedup row nor cursor entry for slot 1
    const dedup = await db.processedEvent.findUnique({
      where: { consumer_eventId: { consumer: 'cg-it', eventId: env.id } },
    });
    expect(dedup).toBeNull();

    const retry = await runWithInboxDedup(
      db,
      { consumer: 'cg-it', stream: STREAM, slot: 1, entryId: '2-1', envelope: env },
      async () => {
        attempts += 1;
      },
    );
    expect(retry.status).toBe('processed');
    expect(attempts).toBe(2);
  });

  it('4. durable DLQ row + bus pending/claim/ack/lag primitives (real redis)', async () => {
    const env = buildEnvelope(
      { type: 'aca.flags.changed', orgId: null, aggregateType: 'FeatureFlag', aggregateId: 'it.dlq', payload: { key: 'it.dlq', to: 3, scope: 'GLOBAL' } },
      { producer: 'it' },
    );
    const dlqId = await writeDeadLetter(db, {
      consumer: 'cg-it',
      stream: STREAM,
      streamEntryId: '3-0',
      envelope: env,
      error: 'boom',
      attemptsTotal: 10,
      firstFailedAt: new Date(),
    });
    const dlq = await db.deadLetterEvent.findUniqueOrThrow({ where: { id: dlqId } });
    expect(dlq.eventId).toBe(env.id);
    expect(dlq.status).toBe('OPEN');

    // bus primitives on the same stream
    const group = 'cg-bus-it';
    await bus.ensureConsumerGroup(STREAM, group, () => '0');
    await bus.appendToStream(STREAM, env);
    const entries = await bus.readGroup(STREAM, group, 'bus-it-0', { count: 10, blockMs: 1_000 });
    const found = entries.filter((e) => e.envelope.id === env.id);
    expect(found).toHaveLength(1);

    const before = await bus.groupLag(STREAM, group);
    expect(before.pending).toBeGreaterThanOrEqual(1);

    const composite = bus.compositeOf(found[0]!);
    expect(await bus.ack(STREAM, group, composite)).toBe(1);

    const after = await bus.groupLag(STREAM, group);
    expect(after.pending).toBe(before.pending - 1);
  });

  it('5. cursor-bootstrap after group wipe + replay re-delivery with original ids', async () => {
    // wipe Redis group state → rebuild from PG cursors (Redis is transport only)
    const slot = shardSlotForAggregate('it.replay', config.shardCount);
    const key = streamKey(STREAM, slot, config.shardCount);
    await bus.redis.del(key).catch(() => undefined);

    const env = buildEnvelope(
      { type: 'aca.flags.changed', orgId: null, aggregateType: 'FeatureFlag', aggregateId: 'it.replay', payload: { key: 'it.replay', to: 4, scope: 'GLOBAL' } },
      { producer: 'it' },
    );
    await db.$transaction(async (tx) => {
      await tx.outboxEvent.create({
        data: {
          id: env.id,
          orgId: null,
          aggregateType: 'FeatureFlag',
          aggregateId: 'it.replay',
          type: env.type,
          version: 1,
          payload: env as never,
          occurredAt: new Date(env.occurredAt),
          publishedAt: new Date(),
        },
      });
    });

    const stats = await replayFromOutbox(db, bus, { type: 'aca.flags.changed', aggregateId: 'it.replay' });
    expect(stats.delivered).toBe(1);

    const raw = await bus.redis.xrange(key, '-', '+');
    expect(raw.length).toBe(1);
    const stored = JSON.parse((raw[0] as [string, string[]])[1][1] as string) as { id: string };
    expect(stored.id).toBe(env.id); // original id preserved — dedup-compatible
  });
});
