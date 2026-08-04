// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { DbClient } from '@aca/database';

@Injectable()
export class AbTestingEngineService {
  private readonly logger = new Logger(AbTestingEngineService.name);
  private db = {} as DbClient;

  constructor() {}

  /**
   * Initiates a true A/B Test by routing the same prompt to two competing models.
   */
  async createExperiment(name: string, modelAId: string, modelBId: string, promptUsed: string) {
    this.logger.log(`Starting A/B test: ${name} between ${modelAId} and ${modelBId}`);
    
    return this.db.aiExperiment.create({
      data: {
        id: crypto.randomUUID(),
        name,
        modelAId,
        modelBId,
        promptUsed,
        metricsA: {},
        metricsB: {},
        status: 'RUNNING'
      }
    });
  }

  /**
   * Concludes the A/B test, compares metrics, and selects the winner.
   */
  async concludeExperiment(experimentId: string, metricsA: any, metricsB: any) {
    const exp = await this.db.aiExperiment.findUnique({ where: { id: experimentId } });
    if (!exp) throw new Error('Experiment not found');

    const scoreA = metricsA.quality / metricsA.timeMs;
    const scoreB = metricsB.quality / metricsB.timeMs;
    const winnerId = scoreA >= scoreB ? exp.modelAId : exp.modelBId;

    this.logger.log(`A/B test ${experimentId} concluded. Winner: ${winnerId}`);

    return this.db.aiExperiment.update({
      where: { id: experimentId },
      data: {
        metricsA,
        metricsB,
        winnerId,
        status: 'COMPLETED'
      }
    });
  }
}
