import { describe, expect, it } from 'vitest';
import {
  RATE_LIMIT_BUCKETS,
  rateLimitIdentity,
  slidingWindowVerdict,
} from '../src/common/rate-limit/rate-limit.js';
import {
  canonicalJson,
  decideExistingRecord,
  requestHashOf,
} from '../src/common/idempotency/idempotency.interceptor.js';

describe('sliding window math', () => {
  const windowMs = 60_000;
  const at = (secIntoWindow: number) => windowMs * 10 + secIntoWindow * 1000; // window #10

  it('allows within the limit', () => {
    const v = slidingWindowVerdict({ nowMs: at(0), windowMs, limit: 5, currentCount: 5, previousCount: 0 });
    expect(v.allowed).toBe(true);
    expect(v.remaining).toBe(0);
    expect(v.retryAfterSec).toBe(0);
    expect(v.resetEpochSec).toBe((windowMs * 11) / 1000);
  });

  it('weights the previous window by remaining overlap', () => {
    // 30s into the window: previous counts at 50%
    const v = slidingWindowVerdict({ nowMs: at(30), windowMs, limit: 10, currentCount: 6, previousCount: 10 });
    expect(v.weightedCount).toBe(11); // 6 + 10*0.5
    expect(v.allowed).toBe(false);
    expect(v.retryAfterSec).toBe(30); // half a window left
  });

  it('boundary: exactly at limit is allowed', () => {
    // 30s in → previous weight 0.5 → 7 + 6*0.5 = 10 = limit
    const v = slidingWindowVerdict({ nowMs: at(30), windowMs, limit: 10, currentCount: 7, previousCount: 6 });
    expect(v.weightedCount).toBe(10);
    expect(v.allowed).toBe(true);
  });

  it('window start: previous window counts at FULL weight', () => {
    const v = slidingWindowVerdict({ nowMs: at(0), windowMs, limit: 10, currentCount: 6, previousCount: 8 });
    expect(v.weightedCount).toBe(14);
    expect(v.allowed).toBe(false);
  });

  it('window indices are consecutive', () => {
    const v = slidingWindowVerdict({ nowMs: at(1), windowMs, limit: 1, currentCount: 1, previousCount: 0 });
    expect(v.previousWindowIndex).toBe(v.windowIndex - 1);
  });
});

describe('rate limit identity + buckets', () => {
  it('prefers user, then api key, then ip', () => {
    expect(rateLimitIdentity({ kind: 'user', userId: 'u1' }, '9.9.9.9')).toBe('u:u1');
    expect(rateLimitIdentity({ kind: 'apikey', apiKeyId: 'k1' }, '9.9.9.9')).toBe('k:k1');
    expect(rateLimitIdentity(null, '9.9.9.9')).toBe('ip:9.9.9.9');
  });

  it('documented buckets exist with sane values (API.md §16)', () => {
    expect(RATE_LIMIT_BUCKETS.oauthToken).toEqual({ limit: 30, windowSec: 60 });
    expect(RATE_LIMIT_BUCKETS.scim).toEqual({ limit: 120, windowSec: 60 });
    expect(RATE_LIMIT_BUCKETS.marketplaceBrowse.limit).toBe(240);
    expect(RATE_LIMIT_BUCKETS.mutations.limit).toBe(60);
  });
});

describe('idempotency canonicalization', () => {
  it('canonicalJson is key-order independent', () => {
    const a = { b: 1, a: { d: [1, 2], c: null } };
    const b = { a: { c: null, d: [1, 2] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('arrays stay order-SENSITIVE (array order is semantic)', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('requestHashOf changes when any part changes', () => {
    const base = requestHashOf({ body: { a: 1 }, params: {}, query: {} });
    expect(requestHashOf({ body: { a: 2 }, params: {}, query: {} })).not.toBe(base);
    expect(requestHashOf({ body: { a: 1 }, params: { orgId: 'x' }, query: {} })).not.toBe(base);
    expect(requestHashOf({ body: { a: 1 }, params: {}, query: { cursor: 'c' } })).not.toBe(base);
    expect(requestHashOf({ body: { a: 1 }, params: {}, query: {} })).toBe(base);
  });
});

describe('idempotency replay decisions', () => {
  const now = new Date('2026-08-02T12:00:00Z');
  const hash = 'h'.repeat(64);

  it('COMPLETED + same hash → replay', () => {
    const d = decideExistingRecord({ state: 'COMPLETED', requestHash: hash, lockedUntil: null }, hash, now);
    expect(d.action).toBe('replay');
  });

  it('COMPLETED + different hash → conflict (same key, different payload)', () => {
    const d = decideExistingRecord({ state: 'COMPLETED', requestHash: 'x'.repeat(64), lockedUntil: null }, hash, now);
    expect(d.action).toBe('conflict');
    expect(d.reason).toMatch(/different/);
  });

  it('IN_FLIGHT inside lease → conflict (in progress)', () => {
    const d = decideExistingRecord(
      { state: 'IN_FLIGHT', requestHash: hash, lockedUntil: new Date(now.getTime() + 5_000) },
      hash,
      now,
    );
    expect(d.action).toBe('conflict');
    expect(d.reason).toMatch(/in progress/);
  });

  it('IN_FLIGHT with expired lease → claim (crash recovery)', () => {
    const d = decideExistingRecord(
      { state: 'IN_FLIGHT', requestHash: hash, lockedUntil: new Date(now.getTime() - 1) },
      hash,
      now,
    );
    expect(d.action).toBe('claim');
  });
});
