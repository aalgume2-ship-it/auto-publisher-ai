/**
 * Worker container — composition root for queue processors.
 * Manages lifecycle of all queue consumers and orchestrators.
 */

import type { DbClient } from '@aca/database';
import type { AppConfig } from '@aca/config';
import type { Logger } from '@aca/logger';
import Redis from 'ioredis';

export class WorkerContainer {
  private redis: Redis;

  constructor(
    private config: AppConfig,
    private prisma: DbClient,
    private logger: Logger,
  ) {
    this.redis = new Redis(this.config.redis.url);
  }

  async start(): Promise<void> {
    this.logger.debug({ module: 'worker-container' }, 'container.start');

    // Verify Redis connection
    const pong = await this.redis.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis connection failed');
    }

    this.logger.info({ module: 'worker-container' }, 'redis.connected');

    // STUB: Queue processors will be wired here
    // - PipelineOrchestrator (workflow executor)
    // - RenderWorker (FFmpeg renders)
    // - EventConsumer (outbox relay)
  }

  async stop(): Promise<void> {
    this.logger.debug({ module: 'worker-container' }, 'container.stop');
    await this.redis.quit();
  }
}
