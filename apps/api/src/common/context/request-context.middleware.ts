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
 * Public endpoints and health/metrics endpoints get the same treatment —
 * invariants are unconditional by design.
 */
import { Injectable, Optional, type NestMiddleware } from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { context, propagation, SpanStatusCode, trace, type Span, type Tracer } from '@opentelemetry/api';
import { uuidv7 } from '@aca/shared';
import { REQUEST_CONTEXT, sanitizeRequestId, type RequestContextState } from './request-context.js';
import { HttpMetrics } from '../telemetry/http-metrics.js';

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

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly metrics: HttpMetrics,
    @Optional() private readonly tracer: Tracer = trace.getTracer('aca.api.http'),
  ) {}

  use(req: FastifyRequest, reply: FastifyReply, next: () => void): void {
    const started = process.hrtime.bigint();
    const state = buildRequestContext(req.headers, req.ip);

    // continue an upstream trace if the client sent a W3C traceparent
    const parent = propagation.extract(context.active(), req.headers);

    const span: Span = this.tracer.startSpan(
      `HTTP ${req.method}`,
      { attributes: { 'http.request.method': req.method, 'url.path': req.url.split('?')[0] ?? '' } },
      parent,
    );
    state.traceId = effectiveTraceId(span);

    reply.header('X-Request-Id', state.requestId);
    reply.header('X-Correlation-Id', state.correlationId);

    reply.raw.once('finish', () => {
      // `url` is the matched route PATTERN (undefined on unmatched/404)
      const route = req.routeOptions?.url ?? 'unmatched';
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
        method: req.method,
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
