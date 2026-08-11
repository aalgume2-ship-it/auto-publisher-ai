/** ImagesService — row creation + enqueue; processing runs in the worker. */
import { Inject, Injectable } from '@nestjs/common';
import type { DbClient } from '@aca/database';
import { ImageGenerationService } from '@aca/video-engine';
import { PRISMA } from '../../common/prisma.provider.js';
import { QueueService } from '../../common/queue/queue.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import type { z } from 'zod';
import type { CreateImageBody } from './images.controller.js';

@Injectable()
export class ImagesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: DbClient,
    private readonly generation: ImageGenerationService,
    private readonly queue: QueueService,
  ) {}

  async start(orgId: string, body: z.infer<typeof CreateImageBody>, userId: string | null) {
    const row = await this.generation.create(orgId, body, userId);
    await this.queue.enqueue('image-generation', 'image.generate', { imageGenerationId: row.id });
    return { id: row.id, status: row.status, createdAt: row.createdAt };
  }

  async list(orgId: string, status?: string) {
    const items = await this.prisma.imageGeneration.findMany({
      where: { orgId, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { items: items.map((g) => this.public(g)) };
  }

  async get(orgId: string, id: string) {
    const row = await this.prisma.imageGeneration.findFirst({ where: { id, orgId } });
    if (!row) throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'image generation not found' });
    return this.public(row);
  }

  private public(g: {
    id: string; prompt: string; negativePrompt: string | null; style: string | null;
    aspectRatio: string; resolution: string; count: number; status: string;
    assetIds: string[]; failureReason: string | null; createdAt: Date; finishedAt: Date | null;
  }) {
    return {
      id: g.id,
      prompt: g.prompt,
      negativePrompt: g.negativePrompt,
      style: g.style,
      aspectRatio: g.aspectRatio,
      resolution: g.resolution,
      count: g.count,
      status: g.status,
      assetIds: g.assetIds,
      failureReason: g.failureReason,
      createdAt: g.createdAt,
      finishedAt: g.finishedAt,
    };
  }
}
