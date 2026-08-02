/**
 * RequestContext — the per-request truth carrier (ADR-025).
 *
 * EVERY request gets a context before any guard/interceptor/pipe/handler runs
 * (RequestContextMiddleware is registered for '*'). Downstream code reads the
 * context; it never re-derives request facts from headers.
 *
 * Population timeline:
 *   middleware: requestId, correlationId, traceId            (always present)
 *   AuthGuard:  principal, userId                            (when authenticated)
 *   TenantGuard: organizationId, membership                  (when tenant-scoped)
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { UuidV7Schema } from '@aca/shared';

/** Who is calling — set by AuthGuard, consumed by RBAC/tenant/credits layers. */
export type Principal =
  | { readonly kind: 'user'; readonly userId: string; readonly sessionId: string | null }
  | {
      readonly kind: 'apikey';
      readonly apiKeyId: string;
      readonly orgId: string;
      readonly scopes: readonly string[];
    };

export type SystemRoleName = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface MembershipInfo {
  role: SystemRoleName;
  customRoleId: string | null;
}

export interface RequestContextState {
  /** uuidv7 minted (or validated-pass-through from X-Request-Id); echoed in every response + ProblemDetails.requestId. */
  requestId: string;
  /** X-Correlation-Id passthrough or = requestId; cross-service causal link. */
  correlationId: string;
  /** W3C trace id (hex32) — from inbound traceparent or minted by the server span. */
  traceId: string;
  /** Route the request matched (fastify route pattern) — low-cardinality metrics label. Set at dispatch. */
  route: string | null;
  principal: Principal | null;
  userId: string | null;
  organizationId: string | null;
  /** Set by TenantGuard for tenant-scoped routes (drives RBAC/capability checks). */
  membership: MembershipInfo | null;
  /** client ip (trusted-proxy aware via fastify request.ip) */
  ip: string;
}

export const REQUEST_CONTEXT = new AsyncLocalStorage<RequestContextState>();

/**
 * Returns the current request's context. Throws INTERNAL-mapped error when
 * called outside a request (background jobs must construct their own
 * equivalent: JobContext — out of HTTP scope).
 */
export function requestContext(): RequestContextState {
  const ctx = REQUEST_CONTEXT.getStore();
  if (ctx === undefined) {
    throw new Error('requestContext() called outside of a request scope');
  }
  return ctx;
}

/** Non-throwing variant for infrastructure that runs in both scopes (logging, metrics). */
export function maybeRequestContext(): RequestContextState | null {
  return REQUEST_CONTEXT.getStore() ?? null;
}

/**
 * Mutations to the context go through this so the audit trail is one function.
 * Only the ownership layer named in the timeline above may set each field.
 */
export function patchRequestContext(patch: Partial<RequestContextState>): RequestContextState {
  const ctx = requestContext();
  Object.assign(ctx, patch);
  return ctx;
}

/** Validates a client-supplied X-Request-Id: pass through only if it is a uuidv7, else mint fresh. */
export function sanitizeRequestId(candidate: string | undefined, mint: () => string): string {
  if (candidate !== undefined && UuidV7Schema.safeParse(candidate).success) return candidate;
  return mint();
}
