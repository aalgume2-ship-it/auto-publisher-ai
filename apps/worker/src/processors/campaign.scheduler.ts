/**
 * CampaignScheduler — the automation engine (runs inside the worker).
 * Every 60s: finds ACTIVE campaigns whose nextRunAt is due and materializes
 * one CampaignPost per platform → enqueues the real generation job.
 * Statuses on the post: SCHEDULED → GENERATING → READY → SCHEDULED(publish)
 * → PUBLISHED | FAILED (mirrored by the generation/publish processors).
 */
import type { DbClient } from '@aca/database';
import type { Logger } from '@aca/logger';
import type { Queue as BullQueue } from 'bullmq';
import { generateId } from '@aca/database';

export class CampaignScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: DbClient,
    private readonly logger: Logger,
    private readonly generationQueue: BullQueue,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch((err) => {
        this.logger.error({ err: err instanceof Error ? err.message : String(err), module: 'campaign-scheduler' }, 'campaign.scheduler.tick.failed');
      });
    }, 60_000);
    void this.tick();
    this.logger.info({ module: 'campaign-scheduler' }, 'campaign.scheduler.started');
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.campaign.findMany({
      where: { status: 'ACTIVE', nextRunAt: { lte: now } },
      take: 20,
    });
    for (const campaign of due) {
      this.logger.info({ campaignId: campaign.id, module: 'campaign-scheduler' }, 'campaign.due');
      for (const platform of campaign.platforms) {
        const channel = await this.prisma.channel.findFirst({
          where: { orgId: campaign.orgId, platform, status: 'CONNECTED' },
          select: { id: true },
        });
        // scheduledFor = next occurrence of campaign.timeOfDay
        const scheduledFor = this.nextTimeOfDay(campaign.timeOfDay, campaign.timezone, campaign.cadence);
        const post = await this.prisma.campaignPost.create({
          data: {
            id: generateId(),
            campaignId: campaign.id,
            orgId: campaign.orgId,
            platform,
            channelId: channel?.id ?? null,
            scheduledFor,
            status: 'GENERATING',
            imageIds: campaign.referenceImageIds,
          },
        });
        const config = (campaign.config ?? {}) as Record<string, unknown>;
        const keyword =
          (typeof config['topic'] === 'string' && config['topic'] ? (config['topic'] as string) : '') ||
          `Automated ${platform} post`;
        await this.generationQueue.add('campaign.generate', {
          campaignPostId: post.id,
          platform,
          keyword,
          referenceImageIds: campaign.referenceImageIds,
          config,
        });
        this.logger.info({ campaignId: campaign.id, postId: post.id, platform, module: 'campaign-scheduler' }, 'campaign.post.enqueued');
      }
      // next run = the next cadence slot after now
      await this.prisma.campaign.update({
        where: { id: campaign.id },
        data: { nextRunAt: this.nextCadence(campaign.timeOfDay, campaign.timezone, campaign.cadence), lastRunAt: now },
      });
    }
  }

  private nextTimeOfDay(timeOfDay: string, timezone: string, cadence: string): Date {
    return this.occurrence(timeOfDay, timezone, cadence, 0);
  }

  private nextCadence(timeOfDay: string, timezone: string, cadence: string): Date {
    return this.occurrence(timeOfDay, timezone, cadence, 1);
  }

  private occurrence(timeOfDay: string, timezone: string, cadence: string, skip: number): Date {
    const [h, m] = timeOfDay.split(':').map(Number) as [number, number];
    const base = new Date();
    let d = new Date(base);
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(base);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
      d = new Date(`${get('year')}-${get('month')}-${get('day')}T${timeOfDay}:00Z`);
    } catch {
      d = new Date(base);
      d.setHours(h, m, 0, 0);
    }
    for (let i = 0; i <= skip; i += 1) {
      if (d.getTime() > base.getTime()) break;
      if (cadence === 'weekly') d.setDate(d.getDate() + 7);
      else d.setDate(d.getDate() + 1);
    }
    if (d.getTime() <= base.getTime()) {
      d = new Date(base);
      d.setHours(h, m, 0, 0);
      d.setDate(d.getDate() + (cadence === 'weekly' ? 7 : 1));
    }
    return d;
  }
}
