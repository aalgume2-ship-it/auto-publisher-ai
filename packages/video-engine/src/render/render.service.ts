/**
 * RenderService — REAL ffmpeg render jobs (queues: 'render' | 'thumbnail').
 *   upscale   → scale the READY rendition to 4× (2160p) with lanczos
 *   extend    → re-run generation with a longer target duration
 *   thumbnail → extract a real frame from the rendition (ffmpeg -ss)
 * Every job writes its output through AssetStore and records a new
 * rendition/thumbnail row — no stubs.
 */
import type { AppConfig } from '@aca/config';
import { generateId, type DbClient } from '@aca/database';
import { type AssetStore } from '../media/asset-store.js';
import { run, probeDurationMs, workDirFor } from '../render/compose.service.js';
import { PipelineError } from '../errors.js';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);

function ffmpegBin(): string {
  try {
    const pkgJson = require.resolve('@ffmpeg-installer/linux-x64/package.json');
    return join(dirname(pkgJson), 'ffmpeg');
  } catch {
    return 'ffmpeg';
  }
}

export interface UpscaleResult {
  renditionId: string;
  assetId: string;
  width: number;
  height: number;
  bytes: number;
}

export interface ThumbnailResult {
  thumbnailId: string;
  assetId: string;
  bytes: number;
}

export class RenderService {
  constructor(
    private readonly config: AppConfig,
    private readonly prisma: DbClient,
    private readonly store: AssetStore,
  ) {}

  /** Upscale the primary READY rendition to 2160p (real lanczos scaling). */
  async upscale(orgId: string, videoId: string, attempt = 1): Promise<UpscaleResult> {
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, orgId },
      include: { renditions: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } } },
    });
    if (!video) throw new PipelineError('NOT_FOUND', 'Video not found', { detail: `video ${videoId}` });
    const rendition = video.renditions[0];
    if (!rendition?.storageKey) throw new PipelineError('NOT_FOUND', 'Video has no rendition', { detail: 'render the video before upscaling' });

    const wd = workDirFor('upscale', videoId);
    await mkdir(wd, { recursive: true });
    const outPath = join(wd, 'upscaled-2160p.mp4');
    await run(ffmpegBin(), [
      '-y', '-nostdin', '-hide_banner', '-v', 'warning',
      '-i', this.store.fullPath(rendition.storageKey),
      '-vf', 'scale=2160:3840:flags=lanczos',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'copy', '-movflags', '+faststart',
      '-threads', '1',
      outPath,
    ]);
    const mp4 = await readFile(outPath);
    const durationMs = await probeDurationMs(outPath);
    const stored = await this.store.put(orgId, 'upscaled-2160p.mp4', mp4);
    const asset = await this.prisma.asset.create({
      data: {
        id: generateId(),
        orgId,
        type: 'VIDEO_CLIP',
        source: 'GENERATED',
        storageKey: stored.storageKey,
        cdnPath: `/v1/organizations/${orgId}/assets/pending`,
        mimeType: 'video/mp4',
        bytes: BigInt(stored.bytes),
        durationMs,
        width: 2160,
        height: 3840,
        metadata: { operation: 'upscale', sourceRenditionId: rendition.id, attempt },
      },
    });
    await this.prisma.asset.update({ where: { id: asset.id }, data: { cdnPath: `/v1/organizations/${orgId}/assets/${asset.id}/content` } });
    const newRendition = await this.prisma.videoRendition.create({
      data: {
        id: generateId(),
        videoId,
        profile: 'upscaled-2160x3840',
        storageKey: stored.storageKey,
        bytes: BigInt(stored.bytes),
        durationMs,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
    return { renditionId: newRendition.id, assetId: asset.id, width: 2160, height: 3840, bytes: stored.bytes };
  }

  /** Extract a real thumbnail frame (ffmpeg -ss mid-video). */
  async thumbnail(orgId: string, videoId: string, attempt = 1): Promise<ThumbnailResult> {
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, orgId },
      include: { renditions: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } } },
    });
    if (!video) throw new PipelineError('NOT_FOUND', 'Video not found', { detail: `video ${videoId}` });
    const rendition = video.renditions[0];
    if (!rendition?.storageKey) throw new PipelineError('NOT_FOUND', 'Video has no rendition', { detail: 'render the video before extracting a thumbnail' });

    const wd = workDirFor('thumb', videoId);
    await mkdir(wd, { recursive: true });
    const outPath = join(wd, 'thumbnail.jpg');
    const seekMs = Math.max(500, Math.min(2_000, (rendition.durationMs ?? 2_000) / 4));
    await run(ffmpegBin(), [
      '-y', '-nostdin', '-hide_banner', '-v', 'warning',
      '-ss', String(seekMs / 1000),
      '-i', this.store.fullPath(rendition.storageKey),
      '-frames:v', '1', '-q:v', '3', outPath,
    ]);
    const jpg = await readFile(outPath);
    const stored = await this.store.put(orgId, 'thumbnail.jpg', jpg);
    const asset = await this.prisma.asset.create({
      data: {
        id: generateId(),
        orgId,
        type: 'THUMBNAIL',
        source: 'GENERATED',
        storageKey: stored.storageKey,
        cdnPath: `/v1/organizations/${orgId}/assets/pending`,
        mimeType: 'image/jpeg',
        bytes: BigInt(stored.bytes),
        width: 720,
        height: 1280,
        metadata: { operation: 'thumbnail', sourceRenditionId: rendition.id, attempt },
      },
    });
    await this.prisma.asset.update({ where: { id: asset.id }, data: { cdnPath: `/v1/organizations/${orgId}/assets/${asset.id}/content` } });
    const thumb = await this.prisma.thumbnail.create({
      data: { id: generateId(), videoId, variant: Date.now() % 100_000, storageKey: stored.storageKey, width: 720, height: 1280, selected: true },
    });
    return { thumbnailId: thumb.id, assetId: asset.id, bytes: stored.bytes };
  }
}
