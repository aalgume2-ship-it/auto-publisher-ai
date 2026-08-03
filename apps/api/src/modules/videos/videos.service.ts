/** VideosService — series (projects) + videos reads/writes + scheduling. */
import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '@aca/config';
import { generateId, type DbClient } from '@aca/database';
import { ApiError } from '../../common/errors/api-error.js';
import { PRISMA } from '../../common/prisma.provider.js';
import { API_CONFIG } from '../../common/redis.provider.js';
import { rawMediaUrl } from './media.controller.js';
import { GenerationService } from './generation.service.js';
import type { CreateSeriesBody, GenerateVideoBody, ScheduleBody } from './videos.dto.js';
import { QueueService } from '../../common/queue/queue.service.js';

const notFound = (what: string) => new ApiError('NOT_FOUND', 'Not Found', { detail: what });

@Injectable()
export class VideosService {
  private readonly mediaSecret: string;

  constructor(
    @Inject(API_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: DbClient,
    private readonly generation: GenerationService,
    private readonly queue: QueueService,
  ) {
    if (!config.auth.jwtSecret) throw new Error('AUTH_JWT_SECRET required for media signing');
    this.mediaSecret = config.auth.jwtSecret;
  }

  /** Short-lived signed browser URL for a stored binary (presigned-URL pattern). */
  private media(storageKey: string | null | undefined): string | null {
    return storageKey ? rawMediaUrl(this.mediaSecret, storageKey) : null;
  }

  /* --------------------------------------------------------------- series */

  async createSeries(orgId: string, body: CreateSeriesBody) {
    const series = await this.prisma.project.create({
      data: {
        id: generateId(),
        orgId,
        name: body.name,
        niche: body.niche,
        language: body.language,
        description: body.description ?? null,
        targetPlatforms: ['youtube'],
        aspectRatio: 'RATIO_9_16',
        stylePreset: { captions: 'burned-ar', voice: 'auto', kenBurns: true },
      },
    });
    return { ...series, counts: { videos: 0 } };
  }

  async listSeries(orgId: string) {
    const rows = await this.prisma.project.findMany({
      where: { orgId, isArchived: false },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { videos: true } } },
    });
    return {
      items: rows.map((s) => ({
        id: s.id,
        name: s.name,
        niche: s.niche,
        language: s.language,
        targetPlatforms: s.targetPlatforms,
        counts: { videos: s._count.videos },
        createdAt: s.createdAt,
      })),
    };
  }

  async getSeries(orgId: string, seriesId: string) {
    const s = await this.prisma.project.findFirst({ where: { id: seriesId, orgId }, include: { _count: { select: { videos: true } } } });
    if (!s) throw notFound('series not found');
    return { id: s.id, name: s.name, niche: s.niche, language: s.language, targetPlatforms: s.targetPlatforms, counts: { videos: s._count.videos }, createdAt: s.createdAt };
  }

  /* ---------------------------------------------------------------- videos */

  async startGeneration(orgId: string, seriesId: string, body: GenerateVideoBody, userId: string | null) {
    await this.getSeries(orgId, seriesId); // tenant guard at row level
    if (body.publishNow && body.channelId) {
      const ch = await this.prisma.channel.findFirst({ where: { id: body.channelId, orgId, status: 'CONNECTED' } });
      if (!ch) throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'channel not found or not connected' });
    }
    const video = await this.prisma.video.create({
      data: {
        id: generateId(),
        orgId,
        projectId: seriesId,
        title: body.keyword.slice(0, 120),
        description: null,
        language: 'ar',
        targetPlatforms: ['youtube'],
        tags: [],
        status: 'QUEUED',
        seo: { keyword: body.keyword, targetSeconds: body.targetSeconds },
        createdById: userId,
      },
    });
    const jobId = await this.generation.enqueue(video.id);
    if (body.publishNow && body.channelId) {
      // publish task waits: queue worker picks it up only after READY (publish service re-checks status).
      await this.schedule(orgId, video.id, { channelId: body.channelId });
    }
    return { video: { id: video.id, status: 'QUEUED' }, jobId };
  }

  async listVideos(orgId: string, filter: { seriesId?: string; status?: string }) {
    const rows = await this.prisma.video.findMany({
      where: { orgId, ...(filter.seriesId ? { projectId: filter.seriesId } : {}), ...(filter.status ? { status: filter.status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { thumbnails: { where: { selected: true }, take: 1 }, renditions: { take: 1 } },
    });
    return {
      items: rows.map((v) => ({
        id: v.id,
        seriesId: v.projectId,
        title: v.title,
        status: v.status,
        durationMs: v.durationMs,
        failureReason: v.failureReason,
        createdAt: v.createdAt,
        publishedAt: v.publishedAt,
        thumbnail: this.media(v.thumbnails[0]?.storageKey),
        videoUrl: this.media(v.renditions[0]?.storageKey),
      })),
    };
  }

  async getVideo(orgId: string, videoId: string) {
    const v = await this.prisma.video.findFirst({
      where: { id: videoId, orgId },
      include: {
        scripts: { where: { isActive: true }, take: 1 },
        scenes: { orderBy: { index: 'asc' }, include: { asset: true } },
        renditions: true,
        thumbnails: { where: { selected: true }, take: 1 },
        subtitleTracks: true,
        publishingTasks: { include: { channel: { select: { id: true, displayName: true, handle: true } } } },
      },
    });
    if (!v) throw notFound('video not found');
    return {
      id: v.id,
      seriesId: v.projectId,
      title: v.title,
      description: v.description,
      status: v.status,
      durationMs: v.durationMs,
      qualityScore: v.qualityScore,
      tags: v.tags,
      hook: v.hook,
      cta: v.cta,
      failureReason: v.failureReason,
      createdAt: v.createdAt,
      publishedAt: v.publishedAt,
      streamUrl: this.media(v.renditions[0]?.storageKey),
      script: v.scripts[0] ? { content: v.scripts[0].content, wordCount: v.scripts[0].wordCount, beats: v.scripts[0].beats } : null,
      scenes: v.scenes.map((s) => ({
        index: s.index,
        narrationText: s.narrationText,
        visualPrompt: s.visualPrompt,
        startMs: s.startMs,
        endMs: s.endMs,
        imageUrl: this.media(s.asset?.storageKey),
      })),
      posts: v.publishingTasks.map((t) => ({
        id: t.id,
        channel: t.channel,
        status: t.status,
        scheduledAt: t.scheduledAt,
        publishedAt: t.publishedAt,
        platformUrl: t.platformUrl,
        lastError: t.lastError,
      })),
    };
  }

  /** MP4 bytes of the first rendition (browser <video> source, Range-aware caller). */
  async renditionFile(orgId: string, videoId: string): Promise<{ storageKey: string }> {
    const v = await this.prisma.video.findFirst({ where: { id: videoId, orgId }, include: { renditions: { take: 1 } } });
    if (!v || !v.renditions[0]?.storageKey) throw notFound('rendition not ready');
    return { storageKey: v.renditions[0].storageKey };
  }

  /** Asset content (images/audio/…) served with the asset's real mime type. */
  async assetFile(orgId: string, assetId: string): Promise<{ storageKey: string; mimeType: string }> {
    const a = await this.prisma.asset.findFirst({ where: { id: assetId, orgId } });
    if (!a) throw notFound('asset not found');
    return { storageKey: a.storageKey, mimeType: a.mimeType };
  }

  /* ------------------------------------------------------------ scheduling */

  async schedule(orgId: string, videoId: string, body: ScheduleBody) {
    const video = await this.prisma.video.findFirst({ where: { id: videoId, orgId } });
    if (!video) throw notFound('video not found');
    if (video.status !== 'READY') {
      throw new ApiError('CONFLICT', 'Video not ready', { detail: `video status is ${video.status} — scheduling requires a READY render` });
    }
    const channel = await this.prisma.channel.findFirst({ where: { id: body.channelId, orgId, status: 'CONNECTED' } });
    if (!channel) throw notFound('channel not found or not connected');
    const when = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    const task = await this.prisma.publishingTask.create({
      data: {
        id: generateId(),
        orgId,
        videoId,
        channelId: channel.id,
        platform: 'youtube',
        renditionProfile: 'shorts-720x1280',
        scheduledAt: when,
        hashtags: video.tags,
      },
    });
    const delayMs = Math.max(0, when.getTime() - Date.now());
    const jobId = await this.queue.enqueue('publish', 'youtube.publish', { taskId: task.id }, { delayMs });
    return { task: this.publicTask(task), jobId };
  }

  async listPosts(orgId: string) {
    const rows = await this.prisma.publishingTask.findMany({
      where: { orgId },
      orderBy: { scheduledAt: 'desc' },
      take: 50,
      include: { video: { select: { id: true, title: true, durationMs: true } }, channel: { select: { id: true, displayName: true, handle: true, avatarUrl: true } } },
    });
    return {
      items: rows.map((t) => ({
        ...this.publicTask(t),
        video: t.video,
        channel: t.channel,
      })),
    };
  }

  async cancelPost(orgId: string, taskId: string) {
    const t = await this.prisma.publishingTask.findFirst({ where: { id: taskId, orgId } });
    if (!t) throw notFound('publishing task not found');
    if (t.status === 'PUBLISHED') throw new ApiError('CONFLICT', 'Already published', { detail: 'a published task cannot be cancelled' });
    await this.prisma.publishingTask.update({ where: { id: t.id }, data: { status: 'CANCELLED' } });
    return { ok: true };
  }

  private publicTask(t: { id: string; status: string; scheduledAt: Date | null; publishedAt: Date | null; platformUrl: string | null; lastError: string | null }) {
    return { id: t.id, status: t.status, scheduledAt: t.scheduledAt, publishedAt: t.publishedAt, platformUrl: t.platformUrl, lastError: t.lastError };
  }
}
