/**
 * Outbox relay (Architecture §7.3, ADR-024): moves unpublished outbox rows to
 * the sharded Redis Streams bus. Runs as N replicas (default 2) — row claiming
 * uses `FOR UPDATE SKIP LOCKED`, so replicas never fight over the same row.
 *
 * Crash safety (exactly the ADR semantics):
 *   tx: claim rows + attempts++                     → committed
 *   for each row: XADD → mark publishedAt           → if the relay dies between
 *     XADD and mark, the row is re-delivered next poll = possible DUPLICATE ON
 *     THE STREAM. That is the documented at-least-once-at-transport property:
 *     inbox dedup makes it harmless for consumers.
 *   Nothing is ever LOST: unpublished rows are always retried.
 */
import type { DbClient } from '@aca/database';
import { EventEnvelopeSchema, eventStreamForType, type EventEnvelope } from '@aca/shared';
import type { RedisStreamsBus } from './adapters/redis-streams-bus.js';
import type { EventsMetrics } from './metrics.js';
import type { Logger, RelayConfig } from './types.js';

const CLAIM_SQL = `
  SELECT id FROM outbox_events
  WHERE published_at IS NULL
  ORDER BY id
  LIMIT $1
  FOR UPDATE SKIP LOCKED
`;

export interface RelayDeps {
  db: DbClient;
  bus: RedisStreamsBus;
  metrics: EventsMetrics;
  logger: Logger;
  config: RelayConfig;
  producer: string;
}

interface ClaimedRow {
  id: string;
  orgId: string | null;
  type: string;
  payload: unknown;
}

export class OutboxRelay {
  private readonly deps: RelayDeps;
  private timer: NodeJS.Timeout | null = null;
  private stopping = false;

  constructor(deps: RelayDeps) {
    this.deps = deps;
  }

  /** One full relay pass. Returns the number of rows DELIVERED to the bus. */
  async runOnce(): Promise<number> {
    const started = Date.now();
    const claimed = await this.claimBatch();
    if (claimed.length === 0) {
      this.deps.metrics.relayBatch(0, Date.now() - started);
      return 0;
    }

    let delivered = 0;
    for (const row of claimed) {
      const env = this.envelopeOf(row);
      if (env === null) {
        await this.markError(row.id, 'payload is not a valid v1.1 envelope');
        this.deps.metrics.relayError('append');
        continue;
      }
      try {
        await this.deps.bus.appendToStream(eventStreamForType(env.type), env);
        await this.deps.db.outboxEvent.update({
          where: { id: row.id },
          data: { publishedAt: new Date(), lastError: null },
        });
        this.deps.metrics.published(env.type, eventStreamForType(env.type), this.deps.producer);
        delivered += 1;
      } catch (err) {
        await this.markError(row.id, err instanceof Error ? err.message : String(err));
        this.deps.metrics.relayError('append');
      }
    }
    this.deps.metrics.relayBatch(delivered, Date.now() - started);
    return delivered;
  }

  private envelopeOf(row: ClaimedRow): EventEnvelope | null {
    const parsed = EventEnvelopeSchema.safeParse(row.payload);
    if (!parsed.success) {
      this.deps.logger.error(
        { outboxId: row.id, type: row.type, issues: parsed.error.issues.map((i: { message: string }) => i.message) },
        'relay: outbox row is not a valid envelope (poison) — quarantining as error',
      );
      return null;
    }
    return { ...parsed.data, payload: parsed.data.payload };
  }

  private async markError(id: string, message: string): Promise<void> {
    await this.deps.db.outboxEvent.update({
      where: { id },
      data: { lastError: message.slice(0, 1024) },
    });
  }

  /** Claims up to batchSize unpublished rows, bumping attempts (lock scoped to tx). */
  private async claimBatch(): Promise<ClaimedRow[]> {
    const { db, config } = this.deps;
    return db.$transaction(
      async (tx) => {
        const ids = await tx.$queryRawUnsafe<Array<{ id: string }>>(CLAIM_SQL, config.batchSize);
        if (ids.length === 0) return [];
        const rows = await tx.outboxEvent.findMany({
          where: { id: { in: ids.map((r) => r.id) } },
          orderBy: { id: 'asc' },
          select: { id: true, orgId: true, type: true, payload: true },
        });
        await tx.outboxEvent.updateMany({
          where: { id: { in: ids.map((r) => r.id) } },
          data: { attempts: { increment: 1 } },
        });
        return rows;
      },
      { timeout: 10_000 },
    );
  }

  /** Polling loop: hot cadence after full batches, idle cadence otherwise. */
  start(): void {
    if (this.timer !== null) return;
    this.stopping = false;
    const tick = async (): Promise<void> => {
      if (this.stopping) return;
      let delivered = 0;
      try {
        delivered = await this.runOnce();
      } catch (err) {
        this.deps.metrics.relayError('claim');
        this.deps.logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          'relay: claim cycle failed',
        );
      }
      if (this.stopping) return;
      const delay =
        delivered >= this.deps.config.batchSize ? this.deps.config.hotPollMs : this.deps.config.pollMs;
      this.timer = setTimeout(() => void tick(), delay);
    };
    this.timer = setTimeout(() => void tick(), 0);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
