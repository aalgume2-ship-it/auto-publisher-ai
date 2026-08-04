// @ts-nocheck
import { Injectable, Inject, Logger } from '@nestjs/common';
import { DbClient } from '@aca/database';
import { MemoryGraphService } from '../memory-graph/memory-graph.service.js';

@Injectable()
export class AnalyticsAiService {
  private readonly logger = new Logger(AnalyticsAiService.name);
  private db = {} as DbClient;

  constructor(@Inject(MemoryGraphService) private readonly memoryGraph: MemoryGraphService) {}

  /**
   * The Self-Learning Core.
   * Analyzes post-publish metrics and feeds them back into the Memory Graph
   * so the next video generation is inherently better.
   */
  async processFeedbackLoop(videoId: string, orgId: string, metrics: { retention: number, ctr: number, engagement: number }) {
    this.logger.log(`Analytics AI processing feedback for video ${videoId}`);

    const insights = this.deriveInsights(metrics);

    const loop = await this.db.analyticsFeedbackLoop.create({
      data: {
        id: crypto.randomUUID(),
        videoId,
        retentionScore: metrics.retention,
        ctr: metrics.ctr,
        engagementRate: metrics.engagement,
        aiDerivedInsights: insights
      }
    });

    if (insights.action === 'REINFORCE') {
      await this.memoryGraph.recordInteraction(orgId, insights.trigger, 'CAMERA', insights.result, 'STYLE', 'CORRELATES_WITH_HIGH_RETENTION');
    }

    return loop;
  }

  private deriveInsights(metrics: { retention: number, ctr: number }) {
    if (metrics.retention > 0.6) {
      return { action: 'REINFORCE', trigger: 'Fast_Pacing', result: 'High_Retention' };
    }
    return { action: 'AVOID', trigger: 'Slow_Intro', result: 'Dropoff' };
  }
}
