// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { DbClient } from '@aca/database';

@Injectable()
export class BenchmarkEngineService {
  private readonly logger = new Logger(BenchmarkEngineService.name);
  private db = {} as DbClient;

  constructor() {}

  /**
   * Executes a benchmark suite on a new model version.
   * Compares Quality, Speed, VRAM, and Cost to generate a composite score.
   */
  async runBenchmark(modelVersionId: string) {
    this.logger.log(`Running benchmark for model version ${modelVersionId}`);

    // Simulated benchmark execution logic
    const results = {
      qualityScore: Math.random() * 0.2 + 0.8, // 0.8 - 1.0
      speedScore: Math.random() * 0.3 + 0.7,
      vramUsedGb: 12.5 + Math.random() * 5,
      costUsd: 0.0015,
      stabilityScore: 0.99
    };

    const compositeScore = (results.qualityScore * 0.4) + (results.speedScore * 0.3) + (results.stabilityScore * 0.3);

    return this.db.$transaction(async (tx) => {
      const run = await tx.aiBenchmarkRun.create({
        data: {
          id: crypto.randomUUID(),
          modelVersionId,
          ...results,
          compositeScore
        }
      });

      await tx.aiModelVersion.update({
        where: { id: modelVersionId },
        data: { benchmarkScore: compositeScore }
      });

      // Trigger automatic ranking update
      await this.updateModelRanking();

      return run;
    });
  }

  /**
   * Recalculates the ranking of all models based on their latest benchmark composite scores.
   */
  async updateModelRanking() {
    this.logger.log(`Updating Model Rankings globally...`);
    const allVersions = await this.db.aiModelVersion.findMany({
      where: { benchmarkScore: { not: null } },
      orderBy: { benchmarkScore: 'desc' }
    });

    for (let i = 0; i < allVersions.length; i++) {
      await this.db.aiModelVersion.update({
        where: { id: allVersions[i].id },
        data: { qualityRank: i + 1 }
      });
    }
  }
}
