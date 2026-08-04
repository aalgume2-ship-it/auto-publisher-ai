// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { DbClient } from '@aca/database';

@Injectable()
export class CostEngineService {
  private readonly logger = new Logger(CostEngineService.name);
  private db = {} as DbClient;

  constructor() {}

  async trackCost(runId: string, stepName: string, metrics: { executionMs: number, vramUsedGb: number, powerWatts: number }) {
    this.logger.debug(`Tracking cost for ${stepName} in run ${runId}`);
    
    // AWS A100 is roughly $4/hr -> $0.0011 per second
    const costPerMs = 0.0000011;
    const estimatedCostUsd = metrics.executionMs * costPerMs;

    await (this.db as any).pipelineCostRecord?.create({
      data: {
        id: crypto.randomUUID(),
        runId,
        stepName,
        ...metrics,
        estimatedCostUsd
      }
    });

    return estimatedCostUsd;
  }
}
