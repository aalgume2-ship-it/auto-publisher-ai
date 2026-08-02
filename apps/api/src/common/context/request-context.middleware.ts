/**
 * RequestContextMiddleware — first code that runs for EVERY request (ADR-025).
 *
 * Responsibilities, in order:
 *   1. mint/validate requestId + correlationId and echo them as response headers
 *   2. extract the W3C traceparent (continuing the client/upstream trace) and
 *      open the server span that parents everything this request does
 *   3. install the RequestContext into AsyncLocalStorage wrapping the ENTIRE
 *      downstream chain (middleware -> guards -> interceptors -> pipes -> handler)
 *   4. on response finish: record http metrics (duration histogram, status
 *      counter) with the matched route as the only dynamic label
 *
 * TRANSPORT CONTRACT (caught by the HTTP integration suite): middleware under
 * the Fastify adapter runs through middie, which hands over the RAW Node
 * (IncomingMessage, ServerResponse) pair — NOT FastifyRequest/FastifyReply
 * wrappers (those exist only from guards/interceptors onward). This file must
 * therefore use setHeader/once('finish')/socket and must NOT call .header()/
 * .raw/.ip/.routeOptions. The matched route pattern is patched into the
 * context by AuthGuard — guard 1, the first post-route stage that sees every
 * matched request, public or rejected alike (true 404s stay 'unmatched').
 *
 * Public endpoints and health/metrics endpoints get the same treatment —
 * invariants are unconditional by design.
 */
import { Inject, Injectable, Optional, type NestMiddleware } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { context, propagation, SpanStatusCode, trace, type Span, type Tracer } from '@opentelemetry/api';
import { uuidv7 } from '@aca/shared';
import type { AppConfig } from '@aca/config';
import {
  REQUEST_CONTEXT,
  sanitizeRequestId,
  type RequestContextState,
} from './request-context.js';
import { HttpMetrics } from '../telemetry/http-metrics.js';
import { API_CONFIG } from '../redis.provider.js';

export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const ZERO_TRACE_ID = '0'.repeat(32);

/**
 * When no OTel SDK is registered (OTLP not configured) spans are no-ops with the
 * all-zero INVALID trace id (W3C forbids it on the wire). We still must stamp a
 * real trace id on every request, so we mint one (uuidv7-shaped hex32 stays
 * time-ordered) — once the SDK is present, its ids win.
 */
export function effectiveTraceId(span: Span): string {
  const id = span.spanContext().traceId;
  return id === ZERO_TRACE_ID ? uuidv7().replaceAll('-', '') : id;
}

/** Pure context-materialization step (unit-tested directly; middleware is the thin adapter). */
export function buildRequestContext(headers: Record<string, string | string[] | undefined>, ip: string): RequestContextState {
  const requestId = sanitizeRequestId(firstHeader(headers[REQUEST_ID_HEADER]), uuidv7);
  const correlation = firstHeader(headers[CORRELATION_ID_HEADER]);
  return {
    requestId,
    correlationId: correlation !== undefined && correlation !== '' ? correlation : requestId,
    traceId: '', // overwritten with the live span's trace id below
    route: null,
    principal: null,
    userId: null,
    organizationId: null,
    membership: null,
    ip,
    userAgent: (() => {
      const ua = firstHeader(headers['user-agent']);
      return ua === undefined || ua === '' ? null : ua.slice(0, 512);
    })(),
  };
}

/** Pure client-ip resolution over the raw request (unit-tested directly). */
export function clientIpOf(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (typeof value === 'string' && value !== '') {
      // first hop = upstream-claimed original client (spoofable, documented —
      // rate-limit identity degrades gracefully to this bucket either way)
      return value.split(',')[0]?.trim() ?? '';
    }
  }
  return req.socket.remoteAddress ?? '';
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly metrics: HttpMetrics,
    @Inject(API_CONFIG) private readonly config: AppConfig,
    @Optional() private readonly tracer: Tracer = trace.getTracer('aca.api.http'),
  ) {}

  use(req: IncomingMessage, reply: ServerResponse, next: () => void): void {
    const started = process.hrtime.bigint();
    const state = buildRequestContext(req.headers, clientIpOf(req, this.config.http.trustProxy));

    // continue an upstream trace if the client sent a W3C traceparent
    const parent = propagation.extract(context.active(), req.headers);

    const span: Span = this.tracer.startSpan(
      `HTTP ${req.method ?? 'UNKNOWN'}`,
      {
        attributes: {
          'http.request.method': req.method ?? 'UNKNOWN',
          'url.path': (req.url ?? '').split('?')[0] ?? '',
        },
      },
      parent,
    );
    state.traceId = effectiveTraceId(span);

    reply.setHeader('X-Request-Id', state.requestId);
    reply.setHeader('X-Correlation-Id', state.correlationId);

    reply.once('finish', () => {
      // route pattern was patched into the context by AuthGuard once routing
      // happened (middleware runs pre-route — 'unmatched' = true 404)
      const route = state.route ?? 'unmatched';
      state.route = route;
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const status = reply.statusCode;
      span.setAttributes({
        'http.response.status_code': status,
        'http.route': route,
        'aca.request_id': state.requestId,
        'aca.organization_id': state.organizationId ?? '',
      });
      if (status >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end();
      this.metrics.observeHttpRequest({
        method: req.method ?? 'UNKNOWN',
        route,
        statusCode: status,
        durationMs,
      });
    });

    const spanCtx = trace.setSpan(context.active(), span);
    context.with(spanCtx, () => {
      REQUEST_CONTEXT.run(state, next);
    });
  }
}
