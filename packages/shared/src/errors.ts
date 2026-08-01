/**
 * RFC 9457 Problem Details — the single error wire shape for the whole platform
 * (docs/API.md §1/§15/§17). Codes are SCREAMING_SNAKE and stable forever; new codes
 * append only (removal is a breaking change).
 */
export const ErrorCodes = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'QUOTA_EXCEEDED',
  'CREDIT_INSUFFICIENT',
  'RATE_LIMITED',
  'PLATFORM_ERROR',
  'PROVIDER_ERROR',
  'INTERNAL',
  // v2 enterprise/platform surface
  'IP_NOT_ALLOWED',
  'SSO_ENFORCED',
  'WORKFLOW_INVALID',
  'PLUGIN_NOT_INSTALLED',
  'PLUGIN_UNHEALTHY',
  'MARKETPLACE_ITEM_UNAVAILABLE',
  'APP_REVIEW_REQUIRED',
  'FLAG_LOCKED',
  // guards used by workers/agents (not returned to HTTP clients directly)
  'SSRF_BLOCKED',
  'CONTENT_POLICY',
  'TENANT_VIOLATION',
] as const;

export type ErrorCode = (typeof ErrorCodes)[number];

export interface ProblemDetails<M = Record<string, unknown>> {
  /** Stable URI identifying the error class, e.g. https://docs.autocreator.ai/errors/credit-insufficient */
  type: string;
  title: string;
  status: number;
  /** Machine-parseable platform code — always present. */
  code: ErrorCode;
  detail?: string;
  /** Echoed X-Request-Id for support correlation. */
  requestId: string;
  meta?: M;
}

export function problemTypeUri(code: ErrorCode): string {
  return `https://docs.autocreator.ai/errors/${code.toLowerCase().replaceAll('_', '-')}`;
}

export class ProviderError extends Error {
  constructor(
    public readonly code:
      | 'RATE_LIMITED'
      | 'UNAVAILABLE'
      | 'CONTENT_POLICY'
      | 'INVALID'
      | 'UPSTREAM',
    message: string,
    public readonly opts?: { provider?: string; model?: string; retryAfterMs?: number },
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
