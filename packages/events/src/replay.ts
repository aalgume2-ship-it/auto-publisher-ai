/**
 * Replay (requirement §5 — rebuild state from the event log).
 *
 * The authoritative source is `outbox_events` (PG), NOT Redis. Replay re-reads
 * the journal with explicit, validated filters and re-delivers the ORIGINAL
 * envelopes (same ids — dedup semantics are preserved end-to-end):
 *
 *  - mode 'republish' (default): XADD into the sharded stream; every consumer
 *    group sees them, inbox dedup protects them normally.
 *  - scoped rebuild: operator first calls deleteProcessedForScope() (dedup.ts)
 *    for ONE consumer, then republish — only that consumer re-processes.
 */
import type { DbClient, Prisma } from '@aca/database';
import { EventEnvelopeSchema, eventStreamForType, type EventEnvelope } from '@aca/shared';
import type { RedisStreamsBus } from './adapters/redis-streams-bus.js';
import type { Logger } from './types.js';

export interface ReplayFilter {
  type?: string;
  aggregateType?: string;
  aggregateId?: string;
  orgId?: string;
  /** occurredAt bounds (inclusive). */
  from?: Date;
  to?: Date;
  /** Hard cap on rows replayed in one invocation (safety valve). */
  limit?: number;
}

export const REPLAY_BATCH = 500;
const REPLAY_HARD_LIMIT = 500_000;

/** Pure query planner — unit-tested; the only place filter→SQL semantics live. */
export function planReplay(filter: ReplayFilter, cursor?: string): {
  where: Prisma.OutboxEventWhereInput;
  orderBy: Array<Record<string, 'asc'>>;
  take: number;
  cursor?: { id: string };
  skip?: number;
} {
  const and: Prisma.OutboxEventWhereInput[] = [
    { publishedAt: { not: null } }, // only rows that actually reached the bus
  ];
  if (filter.type !== undefined) and.push({ type: filter.type });
  if (filter.aggregateType !== undefined) and.push({ aggregateType: filter.aggregateType });
  if (filter.aggregateId !== undefined) and.push({ aggregateId: filter.aggregateId });
  if (filter.orgId !== undefined) and.push({ orgId: filter.orgId });
  if (filter.from !== undefined || filter.to !== undefined) {
    const bounds: { gte?: Date; lte?: Date } = {};
    if (filter.from !== undefined) bounds.gte = filter.from;
    if (filter.to !== undefined) bounds.lte = filter.to;
    and.push({ occurredAt: bounds });
  }
  planAssert(filter);
  return {
    where: { AND: and },
    // uuidv7 ids are time-monotonic — id order == occurredAt order, and it makes
    // cursor pagination exact (no cursor-vs-orderBy mismatch on non-id columns).
    orderBy: [{ id: 'asc' }],
    take: REPLAY_BATCH,
    ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

function planAssert(filter: ReplayFilter): void {
  const hasScope =
    filter.type !== undefined ||
    filter.aggregateType !== undefined ||
    filter.aggregateId !== undefined ||
    filter.orgId !== undefined ||
    filter.from !== undefined ||
    filter.to !== undefined;
  if (!hasScope) {
    throw new Error(
      'replay requires at least one filter (type/aggregate/org/time) — full-journal replays are an operator CLI decision, never a library default',
    );
  }
}

export interface ReplayStats {
  scanned: number;
  delivered: number;
  skippedInvalid: number;
}

/**
 * Streams matching rows into the bus. Envelopes are re-validated against the
 * v1.1 schema before re-delivery (a corrupted/legacy row never re-enters).
 */
export async function replayFromOutbox(
  db: DbClient,
  bus: RedisStreamsBus,
  filter: ReplayFilter,
  opts?: { logger?: Logger; onProgress?: (s: ReplayStats) => void },
): Promise<ReplayStats> {
  const stats: ReplayStats = { scanned: 0, delivered: 0, skippedInvalid: 0 };
  const limit = Math.min(Math.max(1, filter.limit ?? 10_000), REPLAY_HARD_LIMIT);

  let cursor: string | undefined;
  for (;;) {
    const plan = planReplay(filter, cursor);
    const rows = await db.outboxEvent.findMany(plan as Prisma.OutboxEventFindManyArgs);
    if (rows.length === 0) break;

    for (const row of rows) {
      stats.scanned += 1;
      if (stats.delivered >= limit) break;
      const parsed = EventEnvelopeSchema.safeParse(row.payload);
      if (!parsed.success) {
        stats.skippedInvalid += 1;
        opts?.logger?.warn({ outboxId: row.id, type: row.type }, 'replay: skipping invalid envelope row');
        continue;
      }
      const env = parsed.data as EventEnvelope;
      await bus.appendToStream(eventStreamForType(env.type), env);
      stats.delivered += 1;
    }

    const last = rows[rows.length - 1];
    if (last === undefined) break;
    cursor = last.id;
    opts?.onProgress?.({ ...stats });
    if (rows.length < REPLAY_BATCH || stats.delivered >= limit) break;
  }
  return stats;
}
