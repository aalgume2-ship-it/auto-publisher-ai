import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
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
    expect(UuidV7Schema.safeParse(ctx.requestId).success).toBe(true);
  });

  it('sanitizeRequestId accepts only uuidv7', () => {
    const mint = () => 'minted';
    expect(sanitizeRequestId(undefined, mint)).toBe('minted');
    expect(sanitizeRequestId('garbage', mint)).toBe('minted');
    const id = uuidv7();
    expect(sanitizeRequestId(id, mint)).toBe(id);
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

/* ---------- middleware end-to-end over fake fastify primitives ---------- */

function fakeReqRes(headers: Record<string, string>): { req: FastifyRequest; reply: FastifyReply } {
  const raw = new EventEmitter();
  const replyHeaders = new Map<string, string>();
  const req = {
    headers,
    method: 'POST',
    url: '/v1/orgs/019/projects?x=1',
    ip: '192.168.1.10',
    routeOptions: { url: '/v1/orgs/:orgId/projects' },
  } as unknown as FastifyRequest;
  const reply = {
    statusCode: 201,
    raw,
    header(k: string, v: string) {
      replyHeaders.set(k, v);
    },
    get headers() {
      return replyHeaders;
    },
  } as unknown as FastifyReply;
  return { req, reply };
}

describe('RequestContextMiddleware', () => {
  it('installs context for the whole downstream chain and echoes headers', async () => {
    const metrics = new HttpMetrics();
    const mw = new RequestContextMiddleware(metrics);
    const { req, reply } = fakeReqRes({});
    const hdrs = (reply as unknown as { headers: Map<string, string> }).headers;

    let seenInside: string | null = null;
    mw.use(req, reply, () => {
      seenInside = requestContext().requestId; // downstream (guards/handlers) would read this
    });

    expect(seenInside).not.toBeNull();
    expect(UuidV7Schema.safeParse(seenInside).success).toBe(true);
    expect(hdrs.get('X-Request-Id')).toBe(seenInside);
    expect(hdrs.get('X-Correlation-Id')).toBe(seenInside); // no correlation header supplied

    // context does not leak between requests: after the callback, store is empty
    expect(REQUEST_CONTEXT.getStore()).toBeUndefined();
  });

  it('stamps a valid non-zero W3C trace id even without an OTel SDK', () => {
    const mw = new RequestContextMiddleware(new HttpMetrics());
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
    const mw = new RequestContextMiddleware(new HttpMetrics());
    const { req, reply } = fakeReqRes({ traceparent: `00-${upstream}-00f067aa0ba902b7-01` });
    let traceId = '';
    mw.use(req, reply, () => {
      traceId = requestContext().traceId;
    });
    // without SDK the extracted parent cannot be honored by a real span, but the
    // middleware must still emit a valid 32-hex id (regression guard for zero ids)
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('records metrics with the matched route pattern (never the raw URL)', async () => {
    const metrics = new HttpMetrics();
    const mw = new RequestContextMiddleware(metrics);
    const { req, reply } = fakeReqRes({});
    mw.use(req, reply, () => undefined);
    reply.raw.emit('finish');
    const text = await metrics.render();
    expect(text).toContain('aca_http_requests_total{method="POST",route="/v1/orgs/:orgId/projects",status="2xx"} 1');
    expect(text).toContain('aca_http_request_duration_seconds_bucket');
    expect(text).not.toContain('?x=1');
  });

  it('labels unmatched routes as "unmatched" (404 cardinality guard)', async () => {
    const metrics = new HttpMetrics();
    const mw = new RequestContextMiddleware(metrics);
    const raw = new EventEmitter();
    const req = { headers: {}, method: 'GET', url: '/nope', ip: 'x', routeOptions: { url: undefined } } as unknown as FastifyRequest;
    const reply = { statusCode: 404, raw, header: () => undefined } as unknown as FastifyReply;
    mw.use(req, reply, () => undefined);
    raw.emit('finish');
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
