/** VideosService — series (projects) + videos reads/writes + scheduling. */
import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '@aca/config';
import { generateId, type DbClient, type Prisma } from '@aca/database';
import { ApiError } from '../../common/errors/api-error.js';
import { PRISMA } from '../../common/prisma.provider.js';
import { API_CONFIG } from '../../common/redis.provider.js';
import { rawMediaUrl } from './media.controller.js';
import { GenerationService } from './generation.service.js';
import type { AssetListQuery, CreateSeriesBody, GenerateVideoBody, ScheduleBody, UpdateAssetMetaBody, UploadAssetBody } from './videos.dto.js';
import { QueueService } from '../../common/queue/queue.service.js';
import { AssetStore } from '@aca/video-engine';

const notFound = (what: string) => new ApiError('NOT_FOUND', 'Not Found', { detail: what });

@Injectable()
export class VideosService {
  private readonly mediaSecret: string;

  constructor(
    @Inject(API_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: DbClient,
    private readonly generation: GenerationService,
    private readonly queue: QueueService,
    private readonly store: AssetStore,
  ) {
    if (!config.auth.jwtSecret) throw new Error('AUTH_JWT_SECRET required for media signing');
    this.mediaSecret = config.auth.jwtSecret;
  }

  /** Short-lived signed browser URL for a stored binary (presigned-URL pattern). */
  private media(storageKey: string | null | undefined): string | null {
    return storageKey ? rawMediaUrl(this.mediaSecret, storageKey) : null;
  }

  private bunnyCdnUrl(seo: Prisma.JsonValue | null | undefined): string | null {
    if (seo == null) return null;
    const value = asAssetMeta(seo)['bunnyCdnUrl'];
    return typeof value === 'string' && /^https:\/\//i.test(value) ? value : null;
  }

  private publicAsset(_orgId: string, a: {
    id: string;
    type: string;
    mimeType: string;
    bytes: bigint;
    storageKey: string;
    sourceUrl: string | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
  }) {
    const meta = asAssetMeta(a.metadata);
    return {
      id: a.id,
      kind: a.type,
      mimeType: a.mimeType,
      fileName: a.sourceUrl ?? `${a.type.toLowerCase()}-${a.id}`,
      folder: typeof meta['folder'] === 'string' ? (meta['folder'] as string) : null,
      tags: Array.isArray(meta['tags']) ? meta['tags'].filter((t): t is string => typeof t === 'string') : [],
      bytes: a.bytes.toString(),
      url: this.media(a.storageKey),
      createdAt: a.createdAt,
    };
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
      items: rows.map((s: any) => ({
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

  /**
   * Re-run generation for an existing video row (e.g. after a pipeline or
   * render fix — the row keeps its identity; the worker wipes partial
   * children at entry, so re-entry is idempotent). Allowed for FAILED and
   * READY (re-render); refused while a run is in flight or after publish.
   */
  async regenerate(orgId: string, videoId: string) {
    const video = await this.prisma.video.findFirst({ where: { id: videoId, orgId } });
    if (!video) throw notFound('video not found');
    if ((video.status as string) === 'GENERATING' || video.status === 'QUEUED' || (video.status as string) === 'RENDERING' || video.status === 'PUBLISHED') {
      throw new ApiError('CONFLICT', 'Conflict', { detail: `لا يمكن إعادة التوليد والحالة ${video.status} — انتظر انتهاء التشغيل الحالي` });
    }
    await this.prisma.video.update({ where: { id: videoId }, data: { status: 'QUEUED', failureReason: null } });
    const jobId = await this.generation.enqueue(videoId);
    return { video: { id: videoId, status: 'QUEUED' }, jobId };
  }

  async listVideos(orgId: string, filter: { seriesId?: string; status?: string }) {
    const rows = await this.prisma.video.findMany({
      where: { orgId, ...(filter.seriesId ? { projectId: filter.seriesId } : {}), ...(filter.status ? { status: filter.status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { thumbnails: { where: { selected: true }, take: 1 }, renditions: { take: 1 } },
    });
    return {
      items: rows.map((v: any) => ({
        id: v.id,
        seriesId: v.projectId,
        title: v.title,
        status: v.status,
        durationMs: v.durationMs,
        failureReason: v.failureReason,
        createdAt: v.createdAt,
        publishedAt: v.publishedAt,
        seo: v.seo,
        thumbnail: this.media(v.thumbnails[0]?.storageKey),
        videoUrl: this.bunnyCdnUrl(v.seo) ?? this.media(v.renditions[0]?.storageKey),
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
    const renditionKey = v.renditions[0]?.storageKey;
    // In production, return S3 directly so large binary media never crosses
    // the JSON/API proxy or a serverless response adapter. The signed URL is
    // short-lived and scoped to this exact object. Local/DB-backed installs
    // keep using the signed API media endpoint.
    const directStreamUrl = renditionKey ? await this.store.presignedUrl(renditionKey) : null;
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
      streamUrl: this.bunnyCdnUrl(v.seo) ?? directStreamUrl ?? this.media(renditionKey),
      seo: v.seo,
      script: v.scripts[0] ? { content: v.scripts[0].content, wordCount: v.scripts[0].wordCount, beats: v.scripts[0].beats } : null,
      scenes: v.scenes.map((s: any) => ({
        index: s.index,
        narrationText: s.narrationText,
        visualPrompt: s.visualPrompt,
        startMs: s.startMs,
        endMs: s.endMs,
        imageUrl: this.media(s.asset?.storageKey),
      })),
      posts: v.publishingTasks.map((t: any) => ({
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

  async renditionEmbeddedBase64(
    orgId: string,
    videoId: string,
  ): Promise<{ base64: string; sha256: string | null } | null> {
    const { storageKey } = await this.renditionFile(orgId, videoId);
    const asset = await this.prisma.asset.findFirst({ where: { orgId, storageKey }, select: { metadata: true } });
    const metadata = asset?.metadata as { renderBase64?: unknown; renderSha256?: unknown } | null;
    return typeof metadata?.renderBase64 === 'string'
      ? {
          base64: metadata.renderBase64,
          sha256: typeof metadata.renderSha256 === 'string' ? metadata.renderSha256 : null,
        }
      : null;
  }

  /** Asset content (images/audio/…) served with the asset's real mime type. */
  async assetFile(orgId: string, assetId: string): Promise<{ storageKey: string; mimeType: string }> {
    const a = await this.prisma.asset.findFirst({ where: { id: assetId, orgId } });
    if (!a) throw notFound('asset not found');
    return { storageKey: a.storageKey, mimeType: a.mimeType };
  }

  async uploadAsset(orgId: string, body: UploadAssetBody) {
    const data = Buffer.from(body.base64, 'base64');
    if (data.byteLength === 0) {
      throw new ApiError('VALIDATION_FAILED', 'Validation Failed', { detail: 'base64 payload decoded to an empty file' });
    }
    if (data.byteLength > 25 * 1024 * 1024) {
      throw new ApiError('VALIDATION_FAILED', 'Validation Failed', { detail: 'uploaded asset exceeds the current 25 MB limit' });
    }
    const mime = body.mimeType.toLowerCase();
    const expectedFamily = body.kind === 'VIDEO_CLIP' ? 'video/' : body.kind === 'AUDIO' ? 'audio/' : 'image/';
    if (!mime.startsWith(expectedFamily) && !(body.kind === 'BRAND' && mime.startsWith('image/'))) {
      throw new ApiError('VALIDATION_FAILED', 'Validation Failed', { detail: `mimeType ${body.mimeType} does not match asset kind ${body.kind}` });
    }
    const stored = await this.store.put(orgId, body.fileName, data);
    const assetId = generateId();
    const asset = await this.prisma.asset.create({
      data: {
        id: assetId,
        orgId,
        type: body.kind,
        source: 'UPLOADED',
        storageKey: stored.storageKey,
        cdnPath: `/v1/organizations/${orgId}/assets/${assetId}/content`,
        mimeType: body.mimeType,
        bytes: BigInt(stored.bytes),
        sourceUrl: body.fileName,
        metadata: {
          uploadedVia: 'dashboard',
          originalFileName: body.fileName,
          ...(body.folder ? { folder: body.folder } : {}),
          tags: body.tags,
        } as Prisma.InputJsonValue,
      },
    });
    return this.publicAsset(orgId, asset);
  }

  async listAssets(orgId: string, query: AssetListQuery) {
    const rows = await this.prisma.asset.findMany({
      where: { orgId, ...(query.kind ? { type: query.kind as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const items = rows
      .map((row: any) => this.publicAsset(orgId, row))
      .filter((row: { folder: string | null; tags: string[]; fileName: string }) => {
        if (query.folder && row.folder !== query.folder) return false;
        if (query.tag && !row.tags.includes(query.tag)) return false;
        if (query.q) {
          const q = query.q.toLowerCase();
          const hay = `${row.fileName} ${row.folder ?? ''} ${row.tags.join(' ')}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    return { items };
  }

  async updateAssetMeta(orgId: string, assetId: string, body: UpdateAssetMetaBody) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, orgId } });
    if (!asset) throw notFound('asset not found');
    const current = asAssetMeta(asset.metadata);
    const next: Record<string, unknown> = {
      ...current,
      ...(Object.prototype.hasOwnProperty.call(body, 'folder') ? { folder: body.folder } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
    };
    const updated = await this.prisma.asset.update({ where: { id: asset.id }, data: { metadata: next as Prisma.InputJsonValue } });
    return this.publicAsset(orgId, updated);
  }

  /** Presigned PUT for direct browser upload (S3 tier) or database-tier guidance. */
  async presignUpload(orgId: string, body: { fileName: string; mimeType: string; kind: string; sizeBytes?: number | undefined }) {
    const res = await this.store.presignPut(orgId, body.fileName, body.mimeType);
    if (res) {
      return { tier: 's3' as const, uploadUrl: res.url, storageKey: res.storageKey, expiresInSec: this.config.s3.presignTtlSec };
    }
    return {
      tier: 'database' as const,
      uploadUrl: null,
      storageKey: null,
      detail: 'S3 not configured — use POST /assets/upload (base64) instead; media is stored in the durable database blob tier.',
    };
  }

  /** Asset row for a file already PUT to S3 via presigned URL (verify existence first). */
  async confirmS3Upload(orgId: string, body: { fileName: string; mimeType: string; kind: string; storageKey: string; bytes: number }) {
    // verify the object actually exists in S3 — never trust the client blindly
    const head = await this.store.head(body.storageKey);
    if (!head) {
      throw new ApiError('PLATFORM_ERROR', 'S3 not configured', {
        status: 503,
        detail: 'S3 storage is not configured on this deployment — use POST /assets/upload instead.',
      });
    }
    const existing = await this.prisma.asset.findFirst({ where: { orgId, storageKey: body.storageKey } });
    if (existing) return this.publicAsset(orgId, existing); // idempotent confirm
    const asset = await this.prisma.asset.create({
      data: {
        id: generateId(),
        orgId,
        type: body.kind as 'IMAGE' | 'VIDEO_CLIP' | 'AUDIO' | 'BRAND',
        source: 'UPLOADED',
        storageKey: body.storageKey,
        cdnPath: `/v1/organizations/${orgId}/assets/pending`,
        mimeType: body.mimeType,
        bytes: BigInt(head.size),
        sourceUrl: body.fileName,
        metadata: { tier: 's3', uploadBytes: head.size },
      },
    });
    await this.prisma.asset.update({ where: { id: asset.id }, data: { cdnPath: `/v1/organizations/${orgId}/assets/${asset.id}/content` } });
    return this.publicAsset(orgId, asset);
  }

  async deleteAsset(orgId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, orgId } });
    if (!asset) throw notFound('asset not found');
    await this.prisma.asset.delete({ where: { id: asset.id } });
    return { ok: true as const };
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
    // Platform is derived from the channel (providers are per-channel), not hard-coded.
    const platform = channel.platform ?? 'youtube';
    const task = await this.prisma.publishingTask.create({
      data: {
        id: generateId(),
        orgId,
        videoId,
        channelId: channel.id,
        platform,
        renditionProfile: 'shorts-720x1280',
        scheduledAt: when,
        hashtags: video.tags,
      },
    });
    const delayMs = Math.max(0, when.getTime() - Date.now());
    const jobId = await this.queue.enqueue('publish', `${platform}.publish`, { taskId: task.id }, { delayMs });
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
      items: rows.map((t: any) => ({
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

  /** Real operations: upscale / extend / remix / thumbnail → enqueue (worker processes). */
  async enqueueOperation(
    orgId: string,
    videoId: string,
    queue: 'generation' | 'render' | 'thumbnail',
    name: string,
    payload: Record<string, unknown>,
  ) {
    const video = await this.prisma.video.findFirst({ where: { id: videoId, orgId } });
    if (!video) throw notFound('video not found');
    if (video.status !== 'READY' && video.status !== 'PUBLISHED') {
      throw new ApiError('CONFLICT', 'Video not ready', { detail: `video status is ${video.status}` });
    }
    if (payload['operation'] === 'extend') {
      // real extend: regenerate the same video with a longer target duration
      const seo = (video.seo ?? {}) as Record<string, unknown>;
      const current = typeof seo['targetSeconds'] === 'number' ? (seo['targetSeconds'] as number) : 45;
      await this.prisma.video.update({
        where: { id: video.id },
        data: { seo: { ...seo, targetSeconds: Math.min(90, current + 15) } as Prisma.InputJsonValue },
      });
    }
    const jobId = await this.queue.enqueue(queue, name, { videoId, orgId, ...payload });
    return { jobId, videoId };
  }

  private publicTask(t: { id: string; status: string; scheduledAt: Date | null; publishedAt: Date | null; platformUrl: string | null; lastError: string | null }) {
    return { id: t.id, status: t.status, scheduledAt: t.scheduledAt, publishedAt: t.publishedAt, platformUrl: t.platformUrl, lastError: t.lastError };
  }
}

function asAssetMeta(value: Prisma.JsonValue | null): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
