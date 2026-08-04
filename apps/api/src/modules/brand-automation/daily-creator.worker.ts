// @ts-nocheck
import { Injectable, Logger, Inject } from '@nestjs/common';
import { DbClient } from '@aca/database';
import { SmartVideoCreatorService } from './smart-creator.service.js';

@Injectable()
export class DailyAutoCreatorWorker {
  private readonly logger = new Logger(DailyAutoCreatorWorker.name);
  private db = {} as DbClient;

  constructor(@Inject(SmartVideoCreatorService) private readonly creator: SmartVideoCreatorService) {
    const { PrismaClient } = require('@prisma/client');
    this.db = new PrismaClient();
  }

  /**
   * Cron/Scheduled job that sweeps for active Brand Automation Rules.
   */
  async processDailyRules() {
    this.logger.log('Sweeping for due Daily Auto Content rules...');

    const rules = await this.db.brandAutomationRule.findMany({
      where: {
        status: 'ACTIVE',
        nextRunAt: { lte: new Date() }
      }
    });

    for (const rule of rules) {
      try {
        this.logger.log(`Executing automation rule: ${rule.name}`);
        
        for (let i = 0; i < rule.videosPerRun; i++) {
          await this.creator.generateFromAssets(rule.brandKitId, rule.id);
        }

        // Schedule next run
        const nextDate = new Date();
        if (rule.frequency === 'DAILY') nextDate.setDate(nextDate.getDate() + 1);
        if (rule.frequency === 'WEEKLY') nextDate.setDate(nextDate.getDate() + 7);

        await this.db.brandAutomationRule.update({
          where: { id: rule.id },
          data: { lastRunAt: new Date(), nextRunAt: nextDate }
        });

      } catch (err) {
        this.logger.error(`Failed to process rule ${rule.id}`, err);
      }
    }
  }
}
