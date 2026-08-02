/**
 * DomainOperations — ONE systematic answer to requirement "metrics + tracing +
 * structured logging on every business operation". Services wrap every public
 * method: `return this.ops.measure('organizations', 'team.create', () => …)`.
 *
 * Emits per operation:
 *  - OTel span `module.operation` (attributes: aca.module, aca.operation,
 *    aca.org_id, enduser.id) — no-ops safely when no SDK is registered.
 *  - Prometheus: aca_domain_operations_total{module,operation,result}
 *    + aca_domain_operation_duration_seconds{module,operation}.
 *  - Structured log line (pino) with request-context bindings; error path logs
 *    the error CODE (never messages that may carry user input).
 *
 * Labels are constructor-bounded (`module`, `operation` are service-authored
 * constants — never request data).
 */
import { Injectable, Optional } from '@nestjs/common';
import { Counter, Histogram, type Registry } from 'prom-client';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { createLogger, type Logger } from '@aca/logger';
import { HttpMetrics } from './http-metrics.js';
import { maybeRequestContext } from '../context/request-context.js';
import { ApiError } from '../errors/api-error.js';

export type OperationResult = 'success' | 'error';

function singleMetric<T>(registry: Registry, name: string, create: () => T): T {
  const existing = registry.getSingleMetric(name);
  return (existing ?? create()) as T;
}

@Injectable()
export class DomainOperations {
  private readonly total: Counter<'module' | 'operation' | 'result'>;
  private readonly duration: Histogram<'module' | 'operation'>;

  constructor(
    metrics: HttpMetrics,
    @Optional() private readonly logger: Logger = createLogger({ service: 'apps/api' }),
  ) {
    this.total = singleMetric(metrics.registry, 'aca_domain_operations_total', () =>
      new Counter({
        name: 'aca_domain_operations_total',
        help: 'Business operations by module/operation/result.',
        labelNames: ['module', 'operation', 'result'],
        registers: [metrics.registry],
      }),
    );
    this.duration = singleMetric(metrics.registry, 'aca_domain_operation_duration_seconds', () =>
      new Histogram({
        name: 'aca_domain_operation_duration_seconds',
        help: 'Business operation latency by module/operation.',
        labelNames: ['module', 'operation'],
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
        registers: [metrics.registry],
      }),
    );
  }

  /** Wraps a business operation with span+metrics+logging. Rethrows unchanged. */
  async measure<T>(module: string, operation: string, fn: () => Promise<T>): Promise<T> {
    const ctx = maybeRequestContext();
    const tracer = trace.getTracer('aca.api');
    return tracer.startActiveSpan(`${module}.${operation}`, async (span) => {
      span.setAttribute('aca.module', module);
      span.setAttribute('aca.operation', operation);
      if (ctx?.organizationId != null) span.setAttribute('aca.org_id', ctx.organizationId);
      if (ctx?.userId != null) span.setAttribute('enduser.id', ctx.userId);
      const started = performance.now();
      try {
        const result = await fn();
        const durationMs = performance.now() - started;
        this.total.inc({ module, operation, result: 'success' });
        this.duration.observe({ module, operation }, durationMs / 1000);
        span.setStatus({ code: SpanStatusCode.OK });
        this.logger.info({
          module,
          operation,
          result: 'success',
          durationMs: Math.round(durationMs * 100) / 100,
          ...(ctx === null
            ? {}
            : {
                orgId: ctx.organizationId,
                userId: ctx.userId,
                requestId: ctx.requestId,
                traceId: ctx.traceId,
              }),
        }, 'domain.operation.completed');
        return result;
      } catch (err) {
        const durationMs = performance.now() - started;
        const code = err instanceof ApiError ? err.code : 'UNEXPECTED';
        this.total.inc({ module, operation, result: 'error' });
        this.duration.observe({ module, operation }, durationMs / 1000);
        span.recordException(err instanceof Error ? err : new Error(String(err)));
        span.setStatus({ code: SpanStatusCode.ERROR, message: code });
        this.logger.warn({
          module,
          operation,
          result: 'error',
          errorCode: code,
          durationMs: Math.round(durationMs * 100) / 100,
          ...(ctx === null
            ? {}
            : {
                orgId: ctx.organizationId,
                userId: ctx.userId,
                requestId: ctx.requestId,
                traceId: ctx.traceId,
              }),
        }, 'domain.operation.failed');
        throw err;
      } finally {
        span.end();
      }
    });
  }
}
