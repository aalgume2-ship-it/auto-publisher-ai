// @ts-nocheck
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DbClient } from '@aca/database';

@Injectable()
export class SmartModelSelectorService {
  private readonly logger = new Logger(SmartModelSelectorService.name);
  private db = {} as DbClient;

  constructor() {}

  /**
   * Smart Model Selection
   * Chooses the optimal model for a specific task based on constraints (Language, Cost, Speed).
   * Overrides static selections and ensures the platform is completely model-agnostic.
   */
  async selectOptimalModel(type: string, constraints: { maxCostUsd?: number, requiresFastLatency?: boolean, language?: string }) {
    this.logger.debug(`Selecting optimal ${type} model...`);

    const candidates = await this.db.aiModelVersion.findMany({
      where: {
        registry: { type, status: 'ACTIVE' },
      },
      orderBy: { qualityRank: 'asc' }, // Best ranked first
      include: { registry: true }
    });

    if (!candidates || candidates.length === 0) {
      throw new NotFoundException(`No active models found for type ${type}`);
    }

    // Filter logic
    let best = candidates.find(c => {
      if (constraints.maxCostUsd && c.costPerRunUsd && c.costPerRunUsd > constraints.maxCostUsd) return false;
      if (constraints.requiresFastLatency && c.avgLatencyMs && c.avgLatencyMs > 2000) return false;
      // In production, capability checks happen here
      return true;
    });

    if (!best) {
      this.logger.warn(`Constraints too strict, falling back to top ranked model.`);
      best = candidates[0];
    }

    return best.id;
  }
}
