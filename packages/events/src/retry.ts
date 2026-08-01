/**
 * Retry/backoff math — pure, fully tested. The Redis Streams transport has no
 * per-message delay; the consumer's pending-sweeper only processes an entry
 * once its idle time >= backoffMs(deliveries), which yields exponential delay
 * behavior without extra state (ADR-024).
 */
import { RetryPolicySchema, type RetryPolicy, type RetryPolicyInput } from './types.js';

export function resolveRetryPolicy(input?: Partial<RetryPolicyInput>): RetryPolicy {
  return RetryPolicySchema.parse(input ?? {});
}

/**
 * `attempt` is 1-based: 1 = delay before the first redelivery is eligible.
 * delay = min(maxMs, baseMs * 2^(attempt-1)) * (1 ± jitterPct * rng).
 */
export function backoffMs(attempt: number, policy: RetryPolicy, rng: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(attempt));
  const base = Math.min(policy.maxMs, policy.baseMs * 2 ** (n - 1));
  const jitter = policy.jitterPct * base;
  const jittered = base - jitter + 2 * jitter * rng();
  return Math.max(1, Math.round(jittered));
}

/** Undelayed exponential curve (no jitter) — used for assertions/docs. */
export function backoffCurve(attempt: number, policy: RetryPolicy): number {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(policy.maxMs, policy.baseMs * 2 ** (n - 1));
}
