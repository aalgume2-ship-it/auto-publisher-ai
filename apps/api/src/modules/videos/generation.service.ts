/**
 * GenerationService (API side) — enqueue-only facade over the real pipeline.
 * Processing happens in apps/worker (BullMQ consumer) which instantiates
 * @aca/video-engine GenerationService directly. The API never processes
 * jobs in-process.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '@aca/config';
import { PRISMA } from '../../common/prisma.provider.js';
import { API_CONFIG } from '../../common/redis.provider.js';
import { QueueService } from '../../common/queue/queue.service.js';
import type { DbClient } from '@aca/database';

@Injectable()
export class GenerationService {
  constructor(
    @Inject(API_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: DbClient,
    private readonly queue: QueueService,
  ) {}

  /** Enqueue generation for a video row created by VideosService. */
  enqueue(videoId: string): Promise<string> {
    return this.queue.enqueue('generation', 'video.generate', { videoId });
  }
}
