/**
 * Sliding-window rate limiting (docs/API.md §16 buckets + platform default).
 *
 * Algorithm: fixed-current-window counter + weighted previous window
 * (the standard two-bucket sliding approximation; Redis MULTI makes the
 * read-modify-write atomic enough at this granularity — an overrun of at most
 * a few requests is accepted and documented).
 *
 * Keys: rl:<bucket>:<identity>:<windowIndex> with PEXPIRE = 2× window.
 * Identity: userId > apiKeyId > ip (first authenticated dimension available).
 */

export interface RateLimitBucket {
  limit: number;
  windowSec: number;
}

/** Named buckets (docs/API.md §16 + platform defaults). */
export const RATE_LIMIT_BUCKETS = {
  default: { limit: 600, windowSec: 60 },
  publicIp: { limit: 120, windowSec: 60 },
  oauthToken: { limit: 30, windowSec: 60 },
  brandingResolve: { limit: 120, windowSec: 60 },
  marketplaceBrowse: { limit: 240, windowSec: 60 },
  scim: { limit: 120, windowSec: 60 },
  ssoCallbacks: { limit: 60, windowSec: 60 },
  mutations: { limit: 60, windowSec: 60 },
} as const satisfies Record<string, RateLimitBucket>;

export type RateLimitBucketName = keyof typeof RATE_LIMIT_BUCKETS;

export interface SlidingWindowInput {
  nowMs: number;
  windowMs: number;
  limit: number;
  /** current-window count AFTER incrementing for this request */
  currentCount: number;
  previousCount: number;
}

export interface SlidingWindowVerdict {
  allowed: boolean;
  /** weighted total used for the decision */
  weightedCount: number;
  remaining: number;
  /** seconds until enough of the window slides to allow one more request */
  retryAfterSec: number;
  /** epoch seconds when the current fixed window resets (RateLimit-Reset) */
  resetEpochSec: number;
  windowIndex: number;
  previousWindowIndex: number;
}

/** Pure sliding-window math (unit-tested directly; the Redis guard is the thin adapter). */
export function slidingWindowVerdict(input: SlidingWindowInput): SlidingWindowVerdict {
  const windowIndex = Math.floor(input.nowMs / input.windowMs);
  const windowStartMs = windowIndex * input.windowMs;
  const elapsedRatio = (input.nowMs - windowStartMs) / input.windowMs;
  const weighted = input.currentCount + input.previousCount * (1 - elapsedRatio);
  const allowed = weighted <= input.limit;
  const remaining = Math.max(0, Math.floor(input.limit - weighted));
  const retryAfterSec = allowed
    ? 0
    : Math.max(1, Math.ceil((1 - elapsedRatio) * (input.windowMs / 1000)));
  return {
    allowed,
    weightedCount: Math.round(weighted * 100) / 100,
    remaining,
    retryAfterSec,
    resetEpochSec: Math.ceil((windowStartMs + input.windowMs) / 1000),
    windowIndex,
    previousWindowIndex: windowIndex - 1,
  };
}

/** Identity selection for limiter keys (unit-tested directly). */
export function rateLimitIdentity(principal: { kind: 'user'; userId: string } | { kind: 'apikey'; apiKeyId: string } | null, ip: string): string {
  if (principal?.kind === 'user') return `u:${principal.userId}`;
  if (principal?.kind === 'apikey') return `k:${principal.apiKeyId}`;
  return `ip:${ip}`;
}
