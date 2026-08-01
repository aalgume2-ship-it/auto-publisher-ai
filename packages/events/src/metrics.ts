/**
 * Event metrics port + OpenTelemetry implementation (@opentelemetry/api only —
 * the SDK/exporter is owned by the deploying app; with no SDK registered the
 * API no-ops by design, so this file is safe in every environment).
 *
 * Series (stable names — dashboards and CI perf gates depend on them):
 *   aca.events.published.total{type,stream,producer}       counter
 *   aca.events.relay.batch.size                            histogram
 *   aca.events.relay.batch.duration_ms                     histogram
 *   aca.events.relay.errors.total{stage}                   counter
 *   aca.events.consume.latency_ms{type,consumer}           histogram
 *   aca.events.consumed.total{type,consumer}               counter  (throughput)
 *   aca.events.retries.total{type,consumer}                counter
 *   aca.events.failures.total{type,consumer,reason}        counter
 *   aca.events.dlq.total{type,consumer}                    counter
 *   aca.events.lag.entries{stream,group,class}             observable gauge
 *     class = undelivered | pending   (consumer lag — requirement §7)
 */
import {
  metrics,
  type Counter,
  type Histogram,
  type Meter,
  type ObservableGauge,
} from '@opentelemetry/api';
import type { Logger } from './types.js';

export interface EventsMetrics {
  published(type: string, stream: string, producer: string): void;
  relayBatch(size: number, durationMs: number): void;
  relayError(stage: 'claim' | 'append' | 'mark'): void;
  consumed(type: string, consumer: string, latencyMs: number): void;
  retried(type: string, consumer: string): void;
  failed(type: string, consumer: string, reason: string): void;
  deadLettered(type: string, consumer: string): void;
}

/** Explicit opt-out (tests, one-shot scripts). Not a mock — the no-op choice of prod-less envs. */
export class NoopEventsMetrics implements EventsMetrics {
  published(_type: string, _stream: string, _producer: string): void {}
  relayBatch(_size: number, _durationMs: number): void {}
  relayError(_stage: 'claim' | 'append' | 'mark'): void {}
  consumed(_type: string, _consumer: string, _latencyMs: number): void {}
  retried(_type: string, _consumer: string): void {}
  failed(_type: string, _consumer: string, _reason: string): void {}
  deadLettered(_type: string, _consumer: string): void {}
}

export class OtelEventsMetrics implements EventsMetrics {
  private readonly publishedCtr: Counter;
  private readonly batchSize: Histogram;
  private readonly batchMs: Histogram;
  private readonly relayErr: Counter;
  private readonly consumeMs: Histogram;
  private readonly consumedCtr: Counter;
  private readonly retriesCtr: Counter;
  private readonly failuresCtr: Counter;
  private readonly dlqCtr: Counter;
  private readonly lagGauge: ObservableGauge;
  private lagSource: (() => Array<{ attributes: Record<string, string>; value: number }>) | null = null;

  constructor(meter: Meter = metrics.getMeter('aca.events')) {
    this.publishedCtr = meter.createCounter('aca.events.published.total', {
      description: 'Envelopes appended to streams by the outbox relay',
    });
    this.batchSize = meter.createHistogram('aca.events.relay.batch.size', { unit: '{row}' });
    this.batchMs = meter.createHistogram('aca.events.relay.batch.duration_ms', { unit: 'ms' });
    this.relayErr = meter.createCounter('aca.events.relay.errors.total');
    this.consumeMs = meter.createHistogram('aca.events.consume.latency_ms', {
      unit: 'ms',
      description: 'Handler wall time per envelope (success only)',
    });
    this.consumedCtr = meter.createCounter('aca.events.consumed.total');
    this.retriesCtr = meter.createCounter('aca.events.retries.total');
    this.failuresCtr = meter.createCounter('aca.events.failures.total');
    this.dlqCtr = meter.createCounter('aca.events.dlq.total');
    this.lagGauge = meter.createObservableGauge('aca.events.lag.entries', {
      description: 'Consumer group lag per stream: undelivered + pending entries',
    });
    this.lagGauge.addCallback((obs) => {
      for (const sample of this.lagSource?.() ?? []) obs.observe(sample.value, sample.attributes);
    });
  }

  /** Wire the consumer's lag sampler (called at scrape time by the SDK). */
  registerLagSource(source: () => Array<{ attributes: Record<string, string>; value: number }>): void {
    this.lagSource = source;
  }

  published(type: string, stream: string, producer: string): void {
    this.publishedCtr.add(1, { type, stream, producer });
  }
  relayBatch(size: number, durationMs: number): void {
    this.batchSize.record(size);
    this.batchMs.record(durationMs);
  }
  relayError(stage: 'claim' | 'append' | 'mark'): void {
    this.relayErr.add(1, { stage });
  }
  consumed(type: string, consumer: string, latencyMs: number): void {
    this.consumedCtr.add(1, { type, consumer });
    this.consumeMs.record(latencyMs, { type, consumer });
  }
  retried(type: string, consumer: string): void {
    this.retriesCtr.add(1, { type, consumer });
  }
  failed(type: string, consumer: string, reason: string): void {
    this.failuresCtr.add(1, { type, consumer, reason });
  }
  deadLettered(type: string, consumer: string): void {
    this.dlqCtr.add(1, { type, consumer });
  }
}

/** Optional structured-log fallback for ops without an OTel collector. */
export class LoggingEventsMetrics extends NoopEventsMetrics {
  constructor(private readonly logger: Logger) {
    super();
  }
  override deadLettered(type: string, consumer: string): void {
    this.logger.error({ type, consumer, metric: 'aca.events.dlq.total' }, 'event dead-lettered');
  }
}
