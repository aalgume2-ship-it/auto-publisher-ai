/**
 * ApiError — the only domain error type thrown inside apps/api (ADR-025).
 * Carries a platform `code` (shared/errors.ts catalog, append-only) + HTTP
 * status from THE single mapping table below. ProblemDetailsFilter renders it;
 * nothing else in the app shapes error responses.
 */
import {
  type ErrorCode,
  type ProblemDetails,
  problemTypeUri,
} from '@aca/shared';

/**
 * code → HTTP status. THE mapping table (docs/API.md §15 lists the v2 subset;
 * this is the complete normative source — keep it aligned when appending codes).
 */
export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  WORKFLOW_INVALID: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  IP_NOT_ALLOWED: 403,
  SSO_ENFORCED: 403,
  APP_REVIEW_REQUIRED: 403,
  FLAG_LOCKED: 403,
  TENANT_VIOLATION: 404, // masked as NOT_FOUND on the wire (cross-tenant oracle defense)
  NOT_FOUND: 404,
  CONFLICT: 409,
  DOMAIN_VERIFICATION_FAILED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  PLUGIN_NOT_INSTALLED: 409,
  MARKETPLACE_ITEM_UNAVAILABLE: 409,
  QUOTA_EXCEEDED: 402,
  CREDIT_INSUFFICIENT: 402,
  RATE_LIMITED: 429,
  PLATFORM_ERROR: 500,
  SSRF_BLOCKED: 500,
  CONTENT_POLICY: 500,
  INTERNAL: 500,
  AI_CREDENTIALS_MISSING: 503,
  PROVIDER_ERROR: 502,
  PLUGIN_UNHEALTHY: 502,
};

export class ApiError<M = Record<string, unknown>> extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail?: string;
  readonly meta?: M;

  constructor(code: ErrorCode, title: string, opts?: { detail?: string; meta?: M; status?: number }) {
    super(title);
    this.name = 'ApiError';
    this.code = code;
    this.status = opts?.status ?? ERROR_STATUS[code];
    if (opts?.detail !== undefined) this.detail = opts.detail;
    if (opts?.meta !== undefined) this.meta = opts.meta;
  }

  toProblem(requestId: string): ProblemDetails<M> {
    const problem: ProblemDetails<M> = {
      type: problemTypeUri(this.code),
      title: this.message,
      status: this.status,
      code: this.code,
      requestId,
    };
    if (this.detail !== undefined) problem.detail = this.detail;
    if (this.meta !== undefined) problem.meta = this.meta;
    return problem;
  }
}

/* Convenience constructors — one-liners keep call sites honest about codes. */
export const apiErrors = {
  unauthenticated: (detail = 'authentication required') =>
    new ApiError('UNAUTHENTICATED', 'Unauthenticated', { detail }),
  forbidden: (detail = 'insufficient permissions') => new ApiError('FORBIDDEN', 'Forbidden', { detail }),
  forbiddenWithMeta: (detail: string, meta: Record<string, unknown>) =>
    new ApiError('FORBIDDEN', 'Forbidden', { detail, meta }),
  notFound: (resource: string) =>
    new ApiError('NOT_FOUND', 'Not Found', { detail: `${resource} not found` }),
  tenantViolation: () => new ApiError('TENANT_VIOLATION', 'Not Found', { detail: 'resource not found' }),
  conflict: (detail: string) => new ApiError('CONFLICT', 'Conflict', { detail }),
  idempotencyConflict: (detail: string) => new ApiError('IDEMPOTENCY_CONFLICT', 'Idempotency Conflict', { detail }),
  rateLimited: (retryAfterSec: number) =>
    new ApiError('RATE_LIMITED', 'Rate Limited', {
      detail: `rate limit exceeded; retry after ${retryAfterSec}s`,
      meta: { retryAfterSec },
    }),
  flagLocked: (feature: string) =>
    new ApiError('FLAG_LOCKED', 'Feature Locked', {
      detail: `plan does not include feature "${feature}"`,
      meta: { feature },
    }),
  flagLockedWithStatus: (feature: string, subscriptionStatus: string) =>
    new ApiError('FLAG_LOCKED', 'Feature Locked', {
      detail: `subscription status ${subscriptionStatus} does not allow feature "${feature}"`,
      meta: { feature, subscriptionStatus },
    }),
  quotaExceeded: (quota: string, limit: number) =>
    new ApiError('QUOTA_EXCEEDED', 'Quota Exceeded', { detail: `${quota} quota of ${limit} exceeded`, meta: { quota, limit } }),
  creditInsufficient: (required: number, available: number) =>
    new ApiError('CREDIT_INSUFFICIENT', 'Insufficient AI Credits', {
      detail: `operation requires ${required} credits; ${available} available`,
      meta: { required, available },
    }),
  ipNotAllowed: (ip: string) =>
    new ApiError('IP_NOT_ALLOWED', 'IP Not Allowed', {
      detail: 'organization IP allow list is active and the caller address is outside it',
      meta: { ip },
    }),
  domainVerificationFailed: (host: string, expected: string) =>
    new ApiError('DOMAIN_VERIFICATION_FAILED', 'Domain Verification Failed', {
      detail: 'DNS challenge not satisfied for the requested domain',
      meta: { host, expected },
    }),
  validationFailed: (issues: unknown) =>
    new ApiError('VALIDATION_FAILED', 'Validation Failed', {
      detail: 'request validation failed',
      meta: { issues },
    }),
  internal: () => new ApiError('INTERNAL', 'Internal Server Error'),
} as const;
