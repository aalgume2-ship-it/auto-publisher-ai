import { describe, expect, it } from 'vitest';
import { backoffCurve, backoffMs, resolveRetryPolicy } from '../src/retry.js';

const policy = resolveRetryPolicy({});

/** Sequence RNG stepping through 0 → deterministic jitter assertions. */
function seeded(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

describe('retry policy', () => {
  it('ADR-024 defaults: maxAttempts=10, base 1s, max 15min, jitter 20%', () => {
    expect(policy).toEqual({ maxAttempts: 10, baseMs: 1000, maxMs: 900000, jitterPct: 0.2 });
  });

  it('merges partial overrides and validates bounds', () => {
    expect(resolveRetryPolicy({ maxAttempts: 3 }).maxAttempts).toBe(3);
    expect(() => resolveRetryPolicy({ maxAttempts: 0 })).toThrow();
    expect(() => resolveRetryPolicy({ jitterPct: 0.9 })).toThrow();
    expect(() => resolveRetryPolicy({ baseMs: 10 })).toThrow();
  });

  it('exponential curve: 1s,2s,4s,... capped at 15min', () => {
    expect(backoffCurve(1, policy)).toBe(1_000);
    expect(backoffCurve(2, policy)).toBe(2_000);
    expect(backoffCurve(3, policy)).toBe(4_000);
    expect(backoffCurve(10, policy)).toBe(512_000);
    expect(backoffCurve(11, policy)).toBe(900_000); // capped
    expect(backoffCurve(50, policy)).toBe(900_000);
  });

  it('jitter stays within ±20% of the curve', () => {
    const rng = seeded([0, 0.5, 1]);
    for (const a of [1, 2, 5, 10]) {
      const base = backoffCurve(a, policy);
      const samples = [backoffMs(a, policy, rng), backoffMs(a, policy, rng), backoffMs(a, policy, rng)];
      for (const s of samples) {
        expect(s).toBeGreaterThanOrEqual(Math.round(base * 0.8) - 1);
        expect(s).toBeLessThanOrEqual(Math.round(base * 1.2) + 1);
      }
    }
  });

  it('attempt<=1 never divides by zero and is monotonic-ish at the floor', () => {
    expect(backoffMs(0, policy, seeded([0.5]))).toBeGreaterThanOrEqual(1);
    expect(backoffMs(-3, policy, seeded([0.5]))).toBeGreaterThanOrEqual(1);
  });
});
