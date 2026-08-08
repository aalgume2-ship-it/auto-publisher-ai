/**
 * OTel bootstrap for worker — traces, metrics, logs.
 * Exports shutdown function for graceful telemetry flush.
 */

import type { Config } from '@aca/config';
import { NodeTracerProvider } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

export function initTelemetry(config: Config) {
  // STUB: Full OTel setup mirrors apps/api
  // For now, return a no-op object
  return {
    shutdown: async (): Promise<void> => {
      // no-op
    },
  };
}
