import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '@aca/config';
import { UuidV7Schema, uuidv7 } from '@aca/shared';
import {
  REQUEST_CONTEXT,
  patchRequestContext,
  requestContext,
  sanitizeRequestId,
} from '../src/common/context/request-context.js';
import {
  RequestContextMiddleware,
  buildRequestContext,
  clientIpOf,
  effectiveTraceId,
} from '../src/common/context/request-context.middleware.js';
import { HttpMetrics } from '../src/common/telemetry/http-metrics.js';

/* ---------- buildRequestContext / sanitizeRequestId (pure) ---------- */

describe('buildRequestContext', () => {
  it('mints uuidv7 requestId and defaults correlationId = requestId', () => {
    const ctx = buildRequestContext({}, '10.0.0.1');
    expect(UuidV7Schema.safeParse(ctx.requestId).success).toBe(true);
    expect(ctx.correlationId).toBe(ctx.requestId);
    expect(ctx.ip).toBe('10.0.0.1');
    expect(ctx.principal).toBeNull();
    expect(ctx.organizationId).toBeNull();
    expect(ctx.userId).toBeNull();
  });

  it('passes through a VALID client X-Request-Id and X-Correlation-Id', () => {
    const id = uuidv7();
    const ctx = buildRequestContext({ 'x-request-id': id, 'x-correlation-id': 'corr-9' }, '127.0.0.1');
    expect(ctx.requestId).toBe(id);
    expect(ctx.correlationId).toBe('corr-9');
  });

  it('rejects an INVALID client X-Request-Id (mint fresh instead of trusting)', () => {
    const ctx = buildRequestContext({ 'x-request-id': '../../etc/passwd' }, '127.0.0.1');
    expect(ctx.requestId).not.toBe('../../etc/passwd');
  });

  it('sanitizeRequestId accepts only uuidv7', () => {
    const mint = () => 'minted';
    expect(sanitizeRequestId(undefined, mint)).toBe('minted');
    expect(sanitizeRequestId('garbage', mint)).toBe('minted');
    const id = uuidv7();
    expect(sanitizeRequestId(id, mint)).toBe(id);
  });
});

/* ---------- clientIpOf (pure — raw transport, middie contract) ---------- */

describe('clientIpOf', () => {
  const reqWith = (headers: Record<string, string | string[] | undefined>, remoteAddress = '10.9.9.9') =>
    ({ headers, socket: { remoteAddress } }) as unknown as IncomingMessage;

  it('uses the socket peer when trustProxy is off (X-Forwarded-For ignored — never trust unearned)', () => {
    const req = reqWith({ 'x-forwarded-for': '1.2.3.4' });
    expect(clientIpOf(req, false)).toBe('10.9.9.9');
  });

  it('honors the FIRST x-forwarded-for hop when trustProxy is on', () => {
    const req = reqWith({ 'x-forwarded-for': '1.2.3.4, 10.0.0.8' });
    expect(clientIpOf(req, true)).toBe('1.2.3.4');
  });

  it('falls back to the socket peer when the header is absent or empty', () => {
    expect(clientIpOf(reqWith({}), true)).toBe('10.9.9.9');
    expect(clientIpOf(reqWith({ 'x-forwarded-for': '' }), true)).toBe('10.9.9.9');
    const noSocket = { headers: {}, socket: { remoteAddress: undefined } } as unknown as IncomingMessage;
    expect(clientIpOf(noSocket, false)).toBe('');
  });
});

/* ---------- requestContext accessor discipline ---------- */

describe('requestContext accessor', () => {
  it('throws outside a request scope (infrastructure misuse is loud)', () => {
    expect(() => requestContext()).toThrow(/outside of a request scope/);
  });

  it('patchRequestContext mutates only within scope and returns state', () => {
    const state = buildRequestContext({}, '::1');
    REQUEST_CONTEXT.run(state, () => {
      const patched = patchRequestContext({ userId: 'u1', organizationId: 'o1' });
      expect(patched.userId).toBe('u1');
      expect(requestContext().organizationId).toBe('o1');
    });
  });
});

/* ---------- middleware end-to-end over the RAW transport pair ----------
 * middie hands middleware (IncomingMessage, ServerResponse) — the mocks below
 * deliberately reproduce THAT contract (setHeader/once/statusCode/socket),
 * because the pre-fix mocks manufactured wrapper objects with .header()/.raw
 * and thereby CODIFIED the false interface that the HTTP integration suite
 * later caught. Mocks must model reality, not wishes. */

const TEST_CONFIG = { http: { trustProxy: false } } as AppConfig;

function fakeReqRes(headers: Record<string, string>): {
  req: IncomingMessage;
  reply: ServerResponse & { headers: Map<string, string> };
} {
  const replyHeaders = new Map<string, string>();
  const req = {
    headers,
    method: 'POST',
    url: '/v1/orgs/019/projects?x=1',
    socket: { remoteAddress: '192.168.1.10' },
  } as unknown as IncomingMessage;
  const reply = Object.assign(new EventEmitter(), {
    statusCode: 201,
    setHeader(k: string, v: string) {
      replyHeaders.set(k, v);
    },
    headers: replyHeaders,
  }) as unknown as ServerResponse & { headers: Map<string, string> };
  return { req, reply };
}

describe('RequestContextMiddleware', () => {
  it('installs context for the whole downstream chain and echoes headers', async () => {
    const metrics = new HttpMetrics();
    const mw = new RequestContextMiddleware(metrics, TEST_CONFIG);
    const { req, reply } = fakeReqRes({});

    let seenInside: string | null = null;
    mw.use(req, reply, () => {
      seenInside = requestContext().requestId; // downstream (guards/handlers) would read this
    });

    expect(seenInside).not.toBeNull();
    expect(UuidV7Schema.safeParse(seenInside).success).toBe(true);
    expect(reply.headers.get('X-Request-Id')).toBe(seenInside);
    expect(reply.headers.get('X-Correlation-Id')).toBe(seenInside); // no correlation header supplied

    // context does not leak between requests: after the callback, store is empty
    expect(REQUEST_CONTEXT.getStore()).toBeUndefined();
  });

  it('stamps a valid non-zero W3C trace id even without an OTel SDK', () => {
    const mw = new RequestContextMiddleware(new HttpMetrics(), TEST_CONFIG);
    const { req, reply } = fakeReqRes({});
    let traceId = '';
    mw.use(req, reply, () => {
      traceId = requestContext().traceId;
    });
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(traceId).not.toBe('0'.repeat(32));
  });

  it('continues an upstream traceparent when the SDK is absent (ids stay valid)', () => {
    const upstream = '4bf92f3577b34da6a3ce929d0e0e4736';
    const mw = new RequestContextMiddleware(new HttpMetrics(), TEST_CONFIG);
    const { req, reply } = fakeReqRes({ traceparent: `00-${upstream}-00f067aa0ba902b7-01` });
    let traceId = '';
    mw.use(req, reply, () => {
      traceId = requestContext().traceId;
    });
    // without SDK the extracted parent cannot be honored by a real span, but the
    // middleware must still emit a valid 32-hex id (regression guard for zero ids)
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('records metrics with the matched route pattern (patched by AuthGuard, never the raw URL)', async () => {
    const metrics = new HttpMetrics();
    const mw = new RequestContextMiddleware(metrics, TEST_CONFIG);
    const { req, reply } = fakeReqRes({});
    mw.use(req, reply, () => {
      // exactly what AuthGuard does as the first post-route stage
      patchRequestContext({ route: '/v1/orgs/:orgId/projects' });
    });
    reply.emit('finish');
    const text = await metrics.render();
    expect(text).toContain('aca_http_requests_total{method="POST",route="/v1/orgs/:orgId/projects",status="2xx"} 1');
    expect(text).toContain('aca_http_request_duration_seconds_bucket');
    expect(text).not.toContain('?x=1');
  });

  it('labels unmatched routes as "unmatched" (404 cardinality guard)', async () => {
    const metrics = new HttpMetrics();
    const mw = new RequestContextMiddleware(metrics, TEST_CONFIG);
    const { req, reply } = fakeReqRes({});
    (reply as { statusCode: number }).statusCode = 404;
    mw.use(req, reply, () => undefined); // no route patch — guard never ran
    reply.emit('finish');
    const text = await metrics.render();
    expect(text).toContain('route="unmatched"');
  });
});

/* ---------- effectiveTraceId ---------- */

describe('effectiveTraceId', () => {
  it('returns sdk ids when non-zero, mints when zero', () => {
    const zero = { spanContext: () => ({ traceId: '0'.repeat(32) }) };
    const real = { spanContext: () => ({ traceId: 'a3ce929d0e0e47364bf92f3577b34da6' }) };
    expect(effectiveTraceId(zero as never)).toMatch(/^[0-9a-f]{32}$/);
    expect(effectiveTraceId(real as never)).toBe('a3ce929d0e0e47364bf92f3577b34da6');
  });
});
