/**
 * Shared types & configuration for @aca/events (ADR-024).
 */
import { z } from 'zod';

/** Minimal structured logger port — @aca/logger satisfies this structurally. */
export interface Logger {
  debug(obj: Record<string, unknown>, msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

/** Stdout fallback for tooling/scripts — apps inject @aca/logger in production. */
export class ConsoleLogger implements Logger {
  constructor(private readonly scope: string) {}
  private line(level: string, obj: Record<string, unknown>, msg: string): void {
    const entry = { level, scope: this.scope, msg, ...obj, time: new Date().toISOString() };
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(
      JSON.stringify(entry),
    );
  }
  debug(obj: Record<string, unknown>, msg: string): void {
    this.line('debug', obj, msg);
  }
  info(obj: Record<string, unknown>, msg: string): void {
    this.line('info', obj, msg);
  }
  warn(obj: Record<string, unknown>, msg: string): void {
    this.line('warn', obj, msg);
  }
  error(obj: Record<string, unknown>, msg: string): void {
    this.line('error', obj, msg);
  }
}

export const RetryPolicySchema = z.object({
  /** Deliveries (incl. the first) after which the envelope goes to the DLQ. Architecture §7.3: 10. */
  maxAttempts: z.number().int().min(1).max(100).default(10),
  /** First retry becomes claimable after this idle time. */
  baseMs: z.number().int().min(100).default(1_000),
  /** Backoff ceiling (default 15 min). */
  maxMs: z.number().int().min(1_000).default(15 * 60 * 1000),
  /** Symmetric jitter as a fraction of the computed delay (±20%). */
  jitterPct: z.number().min(0).max(0.5).default(0.2),
});
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;
export type RetryPolicyInput = z.input<typeof RetryPolicySchema>;

export const RelayConfigSchema = z.object({
  /** Rows claimed per poll (FOR UPDATE SKIP LOCKED). Architecture §7.3: 500. */
  batchSize: z.number().int().min(1).max(5_000).default(500),
  /** Idle time between polls when the last batch was empty. */
  pollMs: z.number().int().min(250).default(2_000),
  /** Loop turnaround when the last batch was full (immediate-ish). */
  hotPollMs: z.number().int().min(0).default(100),
});
export type RelayConfig = z.infer<typeof RelayConfigSchema>;

export const ConsumerConfigSchema = z.object({
  blockMs: z.number().int().min(500).default(5_000),
  batchSize: z.number().int().min(1).max(1_000).default(50),
  /** Pending-sweeper cadence. */
  sweepMs: z.number().int().min(1_000).default(10_000),
  /** Up to this many pending entries claimed per sweep per slot. */
  sweepBatchSize: z.number().int().min(1).max(500).default(50),
  /** Lag sampling cadence (0 disables). */
  lagSampleMs: z.number().int().min(0).default(15_000),
});
export type ConsumerConfig = z.infer<typeof ConsumerConfigSchema>;

export const EventsConfigSchema = z.object({
  redisUrl: z.string().min(1),
  /** Physical stream shards per logical domain stream. Architecture §7.3: 64. */
  shardCount: z.number().int().min(1).max(256).default(64),
  /** Approximate MAXLEN trim per physical shard (bounded memory — Redis is transport, never truth). */
  streamMaxLen: z.number().int().min(1_000).default(1_000_000),
  retry: RetryPolicySchema.default({}),
  relay: RelayConfigSchema.default({}),
  consumer: ConsumerConfigSchema.default({}),
});
export type EventsConfig = z.infer<typeof EventsConfigSchema>;
export type EventsConfigInput = z.input<typeof EventsConfigSchema>;

export function resolveEventsConfig(input: EventsConfigInput): EventsConfig {
  return EventsConfigSchema.parse(input);
}
