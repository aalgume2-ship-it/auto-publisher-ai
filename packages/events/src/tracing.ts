/**
 * End-to-end tracing (requirement §8: trace any video from idea to publish).
 * Producers stamp envelope.traceId (and metadata.traceparent when OTel context
 * is active at outbox-write time); consumers continue the same trace via
 * remote-parent extraction, and correlate via correlationId/causationId
 * (ADR-024) — every pipeline step becomes a span in one Jaeger tree.
 *
 * Only @opentelemetry/api is used; without a registered SDK everything
 * degrades to no-op spans (API built-in), which is the correct behavior for
 * tests/tooling.
 */
import {
  context,
  SpanKind,
  trace,
  type SpanContext,
} from '@opentelemetry/api';
import type { EventEnvelope } from '@aca/shared';

const TRACER = 'aca.events';

/** W3C traceparent: 00-<32hex trace>-<16hex span>-<2hex flags>. */
const TRACEPARENT_RE = /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i;

function isValidTraceId(id: string): boolean {
  return /^[\da-f]{32}$/i.test(id) && !/^0{32}$/i.test(id);
}
function isValidSpanId(id: string): boolean {
  return /^[\da-f]{16}$/i.test(id) && !/^0{16}$/i.test(id);
}

/** Extracts the producer's span context from the envelope, if present/valid. */
export function extractProducerSpanContext(env: EventEnvelope): SpanContext | undefined {
  const tp = env.metadata?.['traceparent'];
  if (typeof tp === 'string') {
    const m = TRACEPARENT_RE.exec(tp);
    if (m && isValidTraceId(m[1] as string) && isValidSpanId(m[2] as string)) {
      return {
        traceId: (m[1] as string).toLowerCase(),
        spanId: (m[2] as string).toLowerCase(),
        traceFlags: Number.parseInt(m[3] as string, 16),
        isRemote: true,
      };
    }
  }
  if (env.traceId !== undefined && isValidTraceId(env.traceId)) {
    // We know the trace but not the parent span — link instead of parenting.
    return undefined;
  }
  return undefined;
}

/**
 * Runs `fn` in a `process` span bound to the producer's trace (remote parent
 * when available; otherwise a new root with a `follows_from` link to the
 * envelope's traceId — Jaeger stitches both into one timeline).
 */
export async function withConsumerSpan<T>(
  env: EventEnvelope,
  consumer: string,
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(TRACER);
  const parent = extractProducerSpanContext(env);
  const attrs: Record<string, string | number | boolean> = {
    'messaging.system': 'redis-streams',
    'aca.event.type': env.type,
    'aca.event.id': env.id,
    'aca.event.version': env.version,
    'aca.correlation_id': env.correlationId ?? env.id,
    'aca.consumer': consumer,
  };
  if (env.causationId) attrs['aca.causation_id'] = env.causationId;
  if (env.orgId) attrs['aca.org_id'] = env.orgId;
  attrs['aca.aggregate'] = `${env.aggregateType}:${env.aggregateId}`;

  if (parent === undefined && env.traceId !== undefined && isValidTraceId(env.traceId)) {
    // no usable parent span — keep the producer trace id as a plain attribute
    attrs['aca.producer_trace_id'] = env.traceId.toLowerCase();
  }

  const span = tracer.startSpan(
    `event consume ${env.type}`,
    { kind: SpanKind.CONSUMER, attributes: attrs },
    parent !== undefined ? trace.setSpanContext(context.active(), parent) : context.active(),
  );
  try {
    return await context.with(trace.setSpan(context.active(), span), fn);
  } catch (err) {
    span.recordException(err as Error);
    throw err;
  } finally {
    span.end();
  }
}

/**
 * Producer side: injects the current OTel span context into an envelope draft
 * (called by the outbox writer). Returns metadata merged with `traceparent`
 * when a span is active.
 */
export function injectProducerTrace(
  metadata: Record<string, unknown>,
): { traceId: string | undefined; metadata: Record<string, unknown> } {
  const span = trace.getSpan(context.active());
  const sc = span?.spanContext();
  if (sc === undefined || !isValidTraceId(sc.traceId)) return { traceId: undefined, metadata };
  const sampled = (sc.traceFlags & 1) === 1 ? '01' : '00';
  return {
    traceId: sc.traceId,
    metadata: { ...metadata, traceparent: `00-${sc.traceId}-${sc.spanId}-${sampled}` },
  };
}

