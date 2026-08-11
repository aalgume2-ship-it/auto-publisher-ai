/** CampaignsService — brand campaigns: rows, calendar, run-now enqueue.
 *  The worker's scheduler loop creates CampaignPost rows and enqueues
 *  generation jobs when a campaign comes due. */
import { Inject, Injectable } from '@nestjs/common';
import type { DbClient } from '@aca/database';
import { generateId } from '@aca/database';
import { PRISMA } from '../../common/prisma.provider.js';
import { QueueService } from '../../common/queue/queue.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import type { z } from 'zod';
import type { CreateCampaignBody, UpdateCampaignBody } from './campaigns.controller.js';

@Injectable()
export class CampaignsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: DbClient,
    private readonly queue: QueueService,
  ) {}

  async create(orgId: string, body: z.infer<typeof CreateCampaignBody>, userId: string | null) {
    const nextRunAt = this.nextRunAt(body.timeOfDay, body.cadence, body.timezone);
    const campaign = await this.prisma.campaign.create({
      data: {
        id: generateId(),
        orgId,
        name: body.name,
        platforms: body.platforms,
        cadence: body.cadence,
        timeOfDay: body.timeOfDay,
        timezone: body.timezone,
        contentMode: body.contentMode,
        referenceImageIds: body.referenceImageIds,
        config: body.config as object,
        nextRunAt,
        createdById: userId ?? null,
      },
    });
    return this.public(campaign);
  }

  async list(orgId: string) {
    const rows = await this.prisma.campaign.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: { posts: { orderBy: { scheduledFor: 'desc' }, take: 5 } },
    });
    return { items: rows.map((r) => ({ ...this.public(r), recentPosts: r.posts.map((p) => this.postPublic(p)) })) };
  }

  async get(orgId: string, campaignId: string) {
    const row = await this.prisma.campaign.findFirst({
      where: { id: campaignId, orgId },
      include: { posts: { orderBy: { scheduledFor: 'desc' }, take: 200 } },
    });
    if (!row) throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'campaign not found' });
    return { ...this.public(row), posts: row.posts.map((p) => this.postPublic(p)) };
  }

  async update(orgId: string, campaignId: string, body: z.infer<typeof UpdateCampaignBody>) {
    const existing = await this.prisma.campaign.findFirst({ where: { id: campaignId, orgId } });
    if (!existing) throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'campaign not found' });
    const timeOfDay = body.timeOfDay ?? existing.timeOfDay;
    const cadence = body.cadence ?? existing.cadence;
    const timezone = body.timezone ?? existing.timezone;
    const data: Record<string, unknown> = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.platforms !== undefined ? { platforms: body.platforms } : {}),
      ...(body.cadence !== undefined ? { cadence: body.cadence } : {}),
      ...(body.timeOfDay !== undefined ? { timeOfDay: body.timeOfDay } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.contentMode !== undefined ? { contentMode: body.contentMode } : {}),
      ...(body.referenceImageIds !== undefined ? { referenceImageIds: body.referenceImageIds } : {}),
      ...(body.config !== undefined ? { config: body.config as object } : {}),
      nextRunAt: this.nextRunAt(timeOfDay, cadence, timezone),
    };
    const row = await this.prisma.campaign.update({ where: { id: campaignId }, data });
    return this.public(row);
  }

  async remove(orgId: string, campaignId: string): Promise<void> {
    await this.prisma.campaign.deleteMany({ where: { id: campaignId, orgId } });
  }

  /** Run the pipeline for a campaign now: one post per platform. */
  async runNow(orgId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, orgId } });
    if (!campaign) throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'campaign not found' });
    const posts = await this.materializePosts(campaign, new Date());
    return { ok: true, posts: posts.map((p) => this.postPublic(p)) };
  }

  /** Calendar events = campaign posts + scheduled publishing tasks. */
  async calendar(orgId: string, query: { from?: string | undefined; to?: string | undefined; status?: string | undefined }) {
    const where: Record<string, unknown> = { orgId };
    if (query.from || query.to) {
      where.scheduledFor = {};
      if (query.from) (where.scheduledFor as Record<string, unknown>).gte = new Date(query.from);
      if (query.to) (where.scheduledFor as Record<string, unknown>).lte = new Date(query.to);
    }
    if (query.status) where.status = query.status;
    const posts = await this.prisma.campaignPost.findMany({
      where,
      orderBy: { scheduledFor: 'asc' },
      include: { campaign: { select: { id: true, name: true } }, video: { select: { id: true, title: true } } },
    });
    const tasks = await this.prisma.publishingTask.findMany({
      where: { orgId, ...(query.status ? { status: query.status as never } : {}) },
      orderBy: { scheduledAt: 'asc' },
      take: 200,
      include: { video: { select: { id: true, title: true } }, channel: { select: { platform: true, displayName: true } } },
    });
    return {
      items: [
        ...posts.map((p) => ({
          id: p.id,
          kind: 'campaign',
          campaignId: p.campaignId,
          campaignName: p.campaign.name,
          platform: p.platform,
          status: p.status,
          scheduledFor: p.scheduledFor,
          title: p.video?.title ?? p.caption ?? 'Campaign post',
          videoId: p.videoId,
          failureReason: p.failureReason,
        })),
        ...tasks.map((t) => ({
          id: t.id,
          kind: 'publish',
          campaignId: null,
          campaignName: null,
          platform: t.channel.platform,
          status: t.status,
          scheduledFor: t.scheduledAt,
          title: t.video.title,
          videoId: t.videoId,
          failureReason: t.lastError,
        })),
      ],
    };
  }

  /** Scheduler hook (worker): campaigns whose nextRunAt is due. */
  async dueCampaigns(now: Date): Promise<Array<{ id: string; orgId: string }>> {
    const rows = await this.prisma.campaign.findMany({
      where: { status: 'ACTIVE', nextRunAt: { lte: now } },
      select: { id: true, orgId: true },
      take: 20,
    });
    return rows;
  }

  /** Create one post per platform for a campaign and enqueue generation. */
  async materializePosts(campaign: {
    id: string; orgId: string; platforms: string[]; referenceImageIds: string[];
    config: unknown; timeOfDay: string; cadence: string; timezone: string;
  }, scheduledFor: Date) {
    const posts = [];
    for (const platform of campaign.platforms) {
      // pick a CONNECTED channel of that platform if present
      const channel = await this.prisma.channel.findFirst({
        where: { orgId: campaign.orgId, platform, status: 'CONNECTED' },
        select: { id: true },
      });
      const post = await this.prisma.campaignPost.create({
        data: {
          id: generateId(),
          campaignId: campaign.id,
          orgId: campaign.orgId,
          platform,
          channelId: channel?.id ?? null,
          scheduledFor,
          status: 'SCHEDULED',
          imageIds: campaign.referenceImageIds,
        },
      });
      // enqueue the generation chain: image → video → publish
      const config = (campaign.config ?? {}) as Record<string, unknown>;
      const keyword = `${campaign.id.slice(0, 8)}-campaign-${platform}`;
      const jobId = await this.queue.enqueue('generation', 'campaign.generate', {
        campaignPostId: post.id,
        platform,
        keyword,
        referenceImageIds: campaign.referenceImageIds,
        config,
      });
      await this.prisma.campaignPost.update({
        where: { id: post.id },
        data: { status: 'GENERATING' },
      });
      posts.push({ ...post, jobId });
    }
    return posts;
  }

  /** Next run instant from cadence + time-of-day (in the campaign timezone). */
  nextRunAt(timeOfDay: string, cadence: string, timezone: string): Date {
    const [h, m] = timeOfDay.split(':').map(Number) as [number, number];
    const now = new Date();
    const next = new Date(now);
    try {
      // interpret timeOfDay in the campaign timezone
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(now);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
      next.setFullYear(Number(get('year')), Number(get('month')) - 1, Number(get('day')));
      next.setHours(h, m, 0, 0);
    } catch {
      next.setHours(h, m, 0, 0);
    }
    if (next.getTime() <= now.getTime()) {
      if (cadence === 'weekly') next.setDate(next.getDate() + 7);
      else next.setDate(next.getDate() + 1); // daily / custom default
    }
    return next;
  }

  private public(c: {
    id: string; name: string; platforms: string[]; cadence: string; timeOfDay: string;
    timezone: string; contentMode: string; referenceImageIds: string[]; config: unknown;
    status: string; nextRunAt: Date | null; lastRunAt: Date | null; createdAt: Date;
  }) {
    return {
      id: c.id, name: c.name, platforms: c.platforms, cadence: c.cadence, timeOfDay: c.timeOfDay,
      timezone: c.timezone, contentMode: c.contentMode, referenceImageIds: c.referenceImageIds,
      config: c.config, status: c.status, nextRunAt: c.nextRunAt, lastRunAt: c.lastRunAt, createdAt: c.createdAt,
    };
  }

  private postPublic(p: {
    id: string; platform: string; scheduledFor: Date; status: string; videoId: string | null;
    caption: string | null; hashtags: string[]; failureReason: string | null; publishedAt: Date | null;
  }) {
    return {
      id: p.id, platform: p.platform, scheduledFor: p.scheduledFor, status: p.status,
      videoId: p.videoId, caption: p.caption, hashtags: p.hashtags,
      failureReason: p.failureReason, publishedAt: p.publishedAt,
    };
  }
}
