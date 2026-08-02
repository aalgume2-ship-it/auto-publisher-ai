/**
 * OTel bootstrap (ADR-025): one NodeSDK per process, started BEFORE the Nest
 * app is created so the first request is already traced. When OTLP is not
 * configured the SDK stays registered with a no-op exporter policy — spans
 * still carry ids (trace context propagation works) without an export path.
 *
 * Env/config surface comes ONLY from @aca/config (observability section).
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { ATTR_SERVICE_NAMESPACE } from '@opentelemetry/semantic-conventions/incubating';
import type { AppConfig } from '@aca/config';

export interface TelemetryHandle {
  shutdown(): Promise<void>;
}

export function initTelemetry(config: AppConfig): TelemetryHandle {
  const observability = config.observability;
  if (observability.otlpEndpoint === undefined) {
    // no exporter configured — tracing api calls become in-process no-ops that
    // still mint valid trace/span ids (so traceId is always present per ADR-025).
    return { shutdown: () => Promise.resolve() };
  }

  const headers: Record<string, string> = {};
  if (observability.otlpHeaders !== undefined) {
    for (const pair of observability.otlpHeaders.split(',')) {
      const eq = pair.indexOf('=');
      if (eq > 0) headers[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  }

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_NAMESPACE]: observability.serviceNamespace,
      [ATTR_SERVICE_VERSION]: config.version,
    }),
    traceExporter: new OTLPTraceExporter({ url: `${observability.otlpEndpoint}/v1/traces`, headers }),
  });
  sdk.start();

  return {
    shutdown: async () => {
      await sdk.shutdown();
    },
  };
}
