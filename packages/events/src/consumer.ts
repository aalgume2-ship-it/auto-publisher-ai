/**
 * Consumer runner (ADR-024): XREADGROUP loop + pending sweeper + DLQ + lag
 * sampling for one consumer group over one logical stream.
 *
 * Effectively-once contract:
 *   new entry → runWithInboxDedup (dedup row + handler domain writes + cursor
 *   checkpoint in ONE tx) → XACK after commit.
 *   handler throw → tx rolled back → entry stays PENDING → sweeper re-drives
 *   matured entries (idle >= backoff(deliveries)) → after `maxAttempts`
 *   deliveries → durable DLQ row + XACK + metrics (+ optional dlx mirror).
 *
 * Redis group state is disposable: groups are (re)created from PG cursors.
 */
import type { DbClient } from '@aca/database';
import type { EventEnvelope } from '@aca/shared';
import type { RedisStreamsBus, StreamEntry } from './adapters/redis-streams-bus.js';
import { readCursor, runWithInboxDedup } from './dedup.js';
import { dlxMirrorStream, writeDeadLetter } from './dlq.js';
import type { EventsMetrics } from './metrics.js';
import { backoffMs, resolveRetryPolicy } from './retry.js';
import { withConsumerSpan } from './tracing.js';
import type { ConsumerConfig, Logger, RetryPolicyInput } from './types.js';

export interface ConsumerRunnerOptions {
  db: DbClient;
  bus: RedisStreamsBus;
  metrics: EventsMetrics;
  logger: Logger;
  /** Consumer group == dedup identity, e.g. "notifications". */
  group: string;
  /** This replica's consumer name within the group, e.g. "notifications-0". */
  consumerName: string;
  /** Logical streams to consume (events:<domain>). */
  streams: string[];
  handler: (env: EventEnvelope, tx: unknown) => Promise<void>;
  /** Per-consumer retry overrides (defaults: ADR-024 policy). */
  retry?: Partial<RetryPolicyInput>;
  config: ConsumerConfig;
  /** Mirror dead-lettered envelopes to events:dlx:<domain> notification stream. */
  mirrorDlx?: boolean;
  /** Millisecond budget for one handler call (logged, not enforced). */
  slowHandlerMs?: number;
}

interface TimerRef {
  interval: NodeJS.Timeout | null;
  readLoop: Promise<void> | null;
}

export class ConsumerRunner {
  private readonly opts: ConsumerRunnerOptions;
  private readonly policy;
  private readonly timers: TimerRef = { interval: null, readLoop: null };
  private stopping = false;
  private readonly firstFailureAt = new Map<string, number>();

  constructor(opts: ConsumerRunnerOptions) {
    this.opts = opts;
    this.policy = resolveRetryPolicy(opts.retry ?? {});
  }

  /** (Re)creates groups on all shards, bootstrapping from PG cursors. */
  async start(): Promise<void> {
    const { bus, db } = this.opts;
    for (const stream of this.opts.streams) {
      const cursor = await readCursor(db, this.opts.group, stream);
      await bus.ensureConsumerGroup(stream, this.opts.group, (slot) => cursor[String(slot)] ?? '0');
    }
    this.stopping = false;
    this.timers.readLoop = this.readLoop();
    this.timers.interval = setInterval(() => void this.sweep().catch((e) => this.logError('sweep', e)), this.opts.config.sweepMs);
    if (this.opts.config.lagSampleMs > 0) this.wireLagSampling();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timers.interval !== null) clearInterval(this.timers.interval);
    this.timers.interval = null;
    await this.timers.readLoop?.catch(() => undefined);
  }

  /* ---------------- new entries ---------------- */

  private async readLoop(): Promise<void> {
    const { bus, consumerName, group } = this.opts;
    while (!this.stopping) {
      for (const stream of this.opts.streams) {
        if (this.stopping) break;
        const entries = await bus
          .readGroup(stream, group, consumerName, {
            count: this.opts.config.batchSize,
            blockMs: this.opts.config.blockMs,
          })
          .catch((err: unknown) => {
            this.logError('readGroup', err);
            return [] as StreamEntry[];
          });
        for (const entry of entries) {
          if (this.stopping) break;
          await this.processEntry(entry, 1);
        }
      }
    }
  }

  /** Parses/validates one entry and dispatches the deduped handler. */
  private async processEntry(entry: StreamEntry, deliveries: number): Promise<void> {
    const { group, metrics } = this.opts;
    const env = entry.envelope;
    const stream = entry.logical;
    const started = Date.now();

    try {
      const outcome = await withConsumerSpan(env, group, () =>
        runWithInboxDedup(
          this.opts.db,
          {
            consumer: group,
            stream,
            slot: entry.slot,
            entryId: entry.entryId,
            envelope: env,
          },
          (tx) => this.opts.handler(env, tx),
        ),
      );

      await this.opts.bus.ack(stream, group, this.opts.bus.compositeOf(entry));
      if (outcome.status === 'processed') {
        const latencyMs = Date.now() - started;
        metrics.consumed(env.type, group, latencyMs);
        const slow = this.opts.slowHandlerMs ?? 30_000;
        if (latencyMs > slow) {
          this.opts.logger.warn({ type: env.type, eventId: env.id, latencyMs, slow }, 'slow event handler');
        }
      }
      this.firstFailureAt.delete(env.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!this.firstFailureAt.has(env.id)) this.firstFailureAt.set(env.id, Date.now());
      metrics.failed(env.type, group, this.classifyReason(err));
      if (deliveries >= this.policy.maxAttempts) {
        await this.toDlq(entry, message, deliveries);
      } else {
        // leave pending; sweeper re-drives after backoff
        this.opts.logger.warn(
          { type: env.type, eventId: env.id, deliveries, error: message },
          'handler failed — entry pending for retry',
        );
      }
    }
  }

  private classifyReason(err: unknown): string {
    if (err instanceof Error) {
      const name = err.name;
      if (name.length > 0 && name !== 'Error') return name.slice(0, 64);
    }
    return 'unknown';
  }

  /* ---------------- sweeper: retries + DLQ ---------------- */

  private async sweep(): Promise<void> {
    const { bus, group, consumerName } = this.opts;
    for (const stream of this.opts.streams) {
      const pending = await bus.pendingEntries(stream, group, {
        minIdleMs: this.policy.baseMs,
        count: this.opts.config.sweepBatchSize,
      });
      for (const p of pending) {
        if (this.stopping) return;
        const requiredIdleMs = backoffMs(p.deliveries, this.policy);
        if (p.idleMs < requiredIdleMs) continue; // not matured yet
        if (p.deliveries >= this.policy.maxAttempts) {
          const entry = await bus.fetchEntry(stream, p.slot, p.entryId);
          if (entry !== null) await this.toDlq(entry, 'retry budget exhausted', p.deliveries);
          continue;
        }
        // matured → claim to THIS consumer and re-drive
        await bus.claimEntry(stream, group, consumerName, p);
        const entry = await bus.fetchEntry(stream, p.slot, p.entryId);
        if (entry === null) continue; // vanished (acked by another replica mid-flight)
        this.opts.metrics.retried(entry.envelope.type, group);
        await this.processEntry(entry, p.deliveries + 1);
      }
    }
  }

  private async toDlq(entry: StreamEntry, error: string, attempts: number): Promise<void> {
    const { group, db, metrics, logger } = this.opts;
    const env = entry.envelope;
    const firstAt = this.firstFailureAt.get(env.id) ?? Date.now();
    const stream = entry.logical;

    await writeDeadLetter(db, {
      consumer: group,
      stream,
      streamEntryId: entry.entryId,
      envelope: env,
      error,
      attemptsTotal: attempts,
      firstFailedAt: new Date(firstAt),
    });
    await this.opts.bus.ack(stream, group, this.opts.bus.compositeOf(entry));
    this.firstFailureAt.delete(env.id);
    metrics.deadLettered(env.type, group);
    logger.error(
      { type: env.type, eventId: env.id, consumer: group, attempts },
      'event moved to durable DLQ',
    );

    if (this.opts.mirrorDlx === true) {
      const mirror = { ...env, metadata: { ...(env.metadata ?? {}), dlxReason: error.slice(0, 256) } };
      await this.opts.bus.appendToStream(dlxMirrorStream(stream), mirror).catch((e: unknown) => {
        this.logError('dlx-mirror', e); // mirror failure must not hide the persisted DLQ truth
      });
    }
  }

  /* ---------------- lag sampling ---------------- */

  private wireLagSampling(): void {
    const { bus, group, streams } = this.opts;
    if (!('registerLagSource' in this.opts.metrics)) return;
    const m = this.opts.metrics as { registerLagSource: (fn: () => Array<{ attributes: Record<string, string>; value: number }>) => void };
    let latest: Array<{ attributes: Record<string, string>; value: number }> = [];
    setInterval(() => {
      void (async () => {
        const samples: Array<{ attributes: Record<string, string>; value: number }> = [];
        for (const stream of streams) {
          const lag = await bus.groupLag(stream, group).catch(() => null);
          if (lag === null) continue;
          samples.push(
            { attributes: { stream, group, class: 'undelivered' }, value: lag.undelivered },
            { attributes: { stream, group, class: 'pending' }, value: lag.pending },
          );
        }
        latest = samples;
      })();
    }, this.opts.config.lagSampleMs).unref();
    m.registerLagSource(() => latest);
  }

  private logError(stage: string, err: unknown): void {
    this.opts.logger.error(
      { stage, consumer: this.opts.group, err: err instanceof Error ? err.message : String(err) },
      'consumer runner error',
    );
  }
}
