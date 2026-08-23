/**
 * AutopilotService — REAL autonomous operation (Roadmap 'autopilot'):
 * an AutomationConfig row per series defines keywords + cadence + target
 * channels; every 60s this loop finds due configs, creates a video from the
 * round-robin keyword, enqueues generation, and (when a channel is linked)
 * schedules the YouTube publish task for +90 min after the render window.
 * Every run is durable (AutomationConfig.lastRunAt + JobRecord audit).
 */
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { DbClient } from '@aca/database';
import { generateId } from '@aca/database';
import { ApiError } from '../../common/errors/api-error.js';
import { PRISMA } from '../../common/prisma.provider.js';
import { QueueService } from '../../common/queue/queue.service.js';
import { GenerationService } from './generation.service.js';
import { z } from 'zod';

export const AutopilotBodySchema = z.object({
  enabled: z.boolean(),
  keywords: z.array(z.string().min(3).max(160)).min(1).max(20),
  postsPerDay: z.number().int().min(1).max(4).default(1),
  channelIds: z.array(z.string().uuid()).max(10).default([]),
});
export type AutopilotBody = z.infer<typeof AutopilotBodySchema>;

const TICK_MS = 60_000;

@Injectable()
export class AutopilotService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(
    @Inject(PRISMA) private readonly prisma: DbClient,
    private readonly queue: QueueService,
    private readonly generation: GenerationService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    setTimeout(() => void this.tick(), 12_000); // first pass right after boot
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async upsertConfig(orgId: string, seriesId: string, body: AutopilotBody) {
    const project = await this.prisma.project.findFirst({ where: { id: seriesId, orgId } });
    if (!project) throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'series not found' });
    if (body.enabled && body.channelIds.length > 0) {
      const count = await this.prisma.channel.count({ where: { id: { in: body.channelIds }, orgId, status: 'CONNECTED' } });
      if (count !== body.channelIds.length) {
        throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'one or more channels not found or not connected' });
      }
    }
    const existing = await this.prisma.automationConfig.findUnique({ where: { projectId: seriesId } });
    const config = existing
      ? await this.prisma.automationConfig.update({
          where: { projectId: seriesId },
          data: {
            enabled: body.enabled,
            topicKeywords: [...body.keywords],
            postsPerDay: body.postsPerDay,
            reviewMode: 'FULL_AUTO',
            channels: { set: body.channelIds.map((id) => ({ id })) },
          },
          include: { channels: { select: { id: true, displayName: true } } },
        })
      : await this.prisma.automationConfig.create({
          data: {
            id: generateId(),
            projectId: seriesId,
            enabled: body.enabled,
            reviewMode: 'FULL_AUTO',
            postsPerDay: body.postsPerDay,
            topicKeywords: [...body.keywords],
            postingWindows: { tz: 'Asia/Riyadh', windows: [{ start: '12:00', end: '23:00' }] },
            channels: { connect: body.channelIds.map((id) => ({ id })) },
          },
          include: { channels: { select: { id: true, displayName: true } } },
        });
    return { config: this.publicConfig(config) };
  }

  async getConfig(orgId: string, seriesId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: seriesId, orgId } });
    if (!project) throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'series not found' });
    const config = await this.prisma.automationConfig.findUnique({
      where: { projectId: seriesId },
      include: { channels: { select: { id: true, displayName: true } } },
    });
    return { config: config ? this.publicConfig(config) : null };
  }

  private publicConfig(c: { enabled: boolean; postsPerDay: number; topicKeywords: string[]; lastRunAt: Date | null; channels: { id: string; displayName: string }[] }) {
    return { enabled: c.enabled, postsPerDay: c.postsPerDay, keywords: c.topicKeywords, lastRunAt: c.lastRunAt, channels: c.channels };
  }

  /** Finds due configs and launches a real generation (+publish) cycle. */
  async tick(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const configs = await this.prisma.automationConfig.findMany({
        where: { enabled: true },
        include: { project: true, channels: { where: { status: 'CONNECTED' } } },
      });
      for (const c of configs) {
        try {
          const intervalMs = Math.floor(86_400_000 / Math.max(1, c.postsPerDay));
          if (c.lastRunAt && c.lastRunAt.getTime() + intervalMs > Date.now()) continue;
          const keywords = c.topicKeywords.length > 0 ? c.topicKeywords : [c.project.niche ?? 'حقائق مدهشة'];
          const offset = c.lastRunAt ? Math.floor((Date.now() - c.lastRunAt.getTime()) / intervalMs) : 0;
          const keyword = keywords[offset % keywords.length]!;

          const video = await this.prisma.video.create({
            data: {
              id: generateId(),
              orgId: c.project.orgId,
              projectId: c.projectId,
              title: keyword.slice(0, 120),
              language: c.project.language,
              targetPlatforms: ['youtube'],
              tags: [],
              status: 'QUEUED',
              seo: { keyword, targetSeconds: 40, autopilot: true },
            },
          });
          await this.generation.enqueue(video.id);
          for (const ch of c.channels) {
            const task = await this.prisma.publishingTask.create({
              data: {
                id: generateId(),
                orgId: c.project.orgId,
                videoId: video.id,
                channelId: ch.id,
                platform: 'youtube',
                renditionProfile: 'shorts-720x1280',
                scheduledAt: new Date(Date.now() + 90 * 60_000),
                hashtags: [],
              },
            });
            await this.queue.enqueue('publish', 'youtube.publish', { taskId: task.id }, { delayMs: 90 * 60_000 });
          }
          await this.prisma.automationConfig.update({ where: { id: c.id }, data: { lastRunAt: new Date() } });
          console.log(`[autopilot] launched video ${video.id} for series ${c.projectId} keyword="${keyword}"`);
        } catch (err) {
          console.error(`[autopilot] config ${c.id} tick failed:`, err);
        }
      }
    } finally {
      this.inFlight = false;
    }
  }
}
