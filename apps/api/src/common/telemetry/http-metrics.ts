/**
 * HttpMetrics — Prometheus metrics for the HTTP surface (prom-client).
 *
 * Label discipline: the ONLY dynamic label is the matched route PATTERN
 * (`/v1/orgs/:orgId/projects`) — never raw URLs (cardinality explosion in
 * Prometheus is an outage class, not a nit).
 *
 * Metric names carry the `aca_` platform prefix.
 */
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { Injectable } from '@nestjs/common';

export interface HttpObservation {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

const DURATION_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

@Injectable()
export class HttpMetrics {
  readonly registry: Registry;
  private readonly requestsTotal: Counter<'method' | 'route' | 'status'>;
  private readonly requestDuration: Histogram<'method' | 'route'>;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });
    this.requestsTotal = new Counter({
      name: 'aca_http_requests_total',
      help: 'Total HTTP requests by method, matched route and status class.',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
    this.requestDuration = new Histogram({
      name: 'aca_http_request_duration_seconds',
      help: 'HTTP request latency by method and matched route.',
      labelNames: ['method', 'route'],
      buckets: DURATION_BUCKETS_SECONDS,
      registers: [this.registry],
    });
  }

  observeHttpRequest(obs: HttpObservation): void {
    const statusClass = `${Math.floor(obs.statusCode / 100)}xx`;
    this.requestsTotal.inc({ method: obs.method, route: obs.route, status: statusClass });
    this.requestDuration.observe({ method: obs.method, route: obs.route }, obs.durationMs / 1000);
  }

  /** Prometheus text exposition (served by GET /metrics). */
  async render(): Promise<string> {
    return this.registry.metrics();
  }
}

/** DI token so apps/tests can substitute an isolated registry instance. */
export const HTTP_METRICS = 'HTTP_METRICS';
