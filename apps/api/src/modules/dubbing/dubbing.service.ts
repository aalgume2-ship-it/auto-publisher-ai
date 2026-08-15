/** DubbingApiService — row creation + enqueue; processing runs in the worker. */
import { Inject, Injectable } from '@nestjs/common';
import type { DbClient } from '@aca/database';
import { DubbingService } from '@aca/video-engine';
import { PRISMA } from '../../common/prisma.provider.js';
import { QueueService } from '../../common/queue/queue.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import type { z } from 'zod';
import type { CreateDubBody } from './dubbing.controller.js';

@Injectable()
export class DubbingApiService {
  constructor(
    @Inject(PRISMA) private readonly prisma: DbClient,
    private readonly dubbing: DubbingService,
    private readonly queue: QueueService,
  ) {}

  async start(orgId: string, videoId: string, body: z.infer<typeof CreateDubBody>, userId: string | null) {
    const video = await this.prisma.video.findFirst({ where: { id: videoId, orgId } });
    if (!video) throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'video not found' });
    if (video.status !== 'READY' && video.status !== 'PUBLISHED') {
      throw new ApiError('CONFLICT', 'Video not READY', { detail: 'dub the video after generation completes' });
    }
    const row = await this.dubbing.create(orgId, videoId, body.targetLanguage, body.voiceId ?? null, userId);
    await this.queue.enqueue('dubbing', 'video.dub', { dubbingJobId: row.id });
    return { id: row.id, status: row.status, videoId, targetLanguage: row.targetLanguage, createdAt: row.createdAt };
  }

  async list(orgId: string, status?: string) {
    const items = await this.prisma.dubbingJob.findMany({
      where: { orgId, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { items: items.map((j) => this.public(j)) };
  }

  async get(orgId: string, id: string) {
    const row = await this.prisma.dubbingJob.findFirst({ where: { id, orgId } });
    if (!row) throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'dubbing job not found' });
    return this.public(row);
  }

  private public(j: {
    id: string; videoId: string; sourceLanguage: string; targetLanguage: string;
    status: string; outputRenditionId: string | null; failureReason: string | null;
    createdAt: Date; finishedAt: Date | null;
  }) {
    return {
      id: j.id,
      videoId: j.videoId,
      sourceLanguage: j.sourceLanguage,
      targetLanguage: j.targetLanguage,
      status: j.status,
      outputRenditionId: j.outputRenditionId,
      failureReason: j.failureReason,
      createdAt: j.createdAt,
      finishedAt: j.finishedAt,
    };
  }
}
