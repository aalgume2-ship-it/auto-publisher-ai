/**
 * OTel bootstrap for worker — traces, metrics, logs.
 * Exports shutdown function for graceful telemetry flush.
 */

import type { AppConfig } from '@aca/config';

export function initTelemetry(config: AppConfig) {
  // STUB: Full OTel setup mirrors apps/api
  // For now, return a no-op object
  return {
    shutdown: async (): Promise<void> => {
      // no-op
    },
  };
}
