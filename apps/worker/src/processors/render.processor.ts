/** Render + thumbnail processors — BullMQ queues 'render' and 'thumbnail'. */
import type { DbClient } from '@aca/database';
import type { Logger } from '@aca/logger';
import { UnrecoverableError, type Job } from 'bullmq';
import { AssetStore, RenderService } from '@aca/video-engine';
import type { AppConfig } from '@aca/config';
import { beginJob, completeJob, failJob } from './job-record.js';

export function createRenderProcessor(config: AppConfig, prisma: DbClient, logger: Logger) {
  const store = new AssetStore(config, prisma);
  const pipeline = new RenderService(config, prisma, store);

  return async (job: Job<Record<string, unknown>>): Promise<void> => {
    const { id: jobId, data } = job;
    if (!jobId) throw new Error('job without id');
    const recordId = typeof data['jobRecordId'] === 'string' ? (data['jobRecordId'] as string) : null;
    const guard = await beginJob(prisma, logger, jobId, 'render', recordId);
    if (guard.skip) return;
    const videoId = typeof data['videoId'] === 'string' ? (data['videoId'] as string) : null;
    const orgId = typeof data['orgId'] === 'string' ? (data['orgId'] as string) : null;
    if (!videoId || !orgId) throw new Error('render payload missing videoId/orgId');
    const operation = data['operation'] === 'upscale' ? 'upscale' : 'upscale';
    try {
      const result = await pipeline.upscale(orgId, videoId, job.attemptsMade + 1);
      await completeJob(prisma, guard.jobRecordId);
      logger.info({ jobId, videoId, operation, result, module: 'render' }, 'render.upscale.completed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const terminal = (err as { terminal?: boolean })?.terminal === true;
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
      if (lastAttempt || terminal) {
        await failJob(prisma, guard.jobRecordId, msg);
        if (terminal) throw new UnrecoverableError(msg);
      }
      throw err;
    }
  };
}

export function createThumbnailProcessor(config: AppConfig, prisma: DbClient, logger: Logger) {
  const store = new AssetStore(config, prisma);
  const pipeline = new RenderService(config, prisma, store);

  return async (job: Job<Record<string, unknown>>): Promise<void> => {
    const { id: jobId, data } = job;
    if (!jobId) throw new Error('job without id');
    const recordId = typeof data['jobRecordId'] === 'string' ? (data['jobRecordId'] as string) : null;
    const guard = await beginJob(prisma, logger, jobId, 'thumbnail', recordId);
    if (guard.skip) return;
    const videoId = typeof data['videoId'] === 'string' ? (data['videoId'] as string) : null;
    const orgId = typeof data['orgId'] === 'string' ? (data['orgId'] as string) : null;
    if (!videoId || !orgId) throw new Error('thumbnail payload missing videoId/orgId');
    try {
      const result = await pipeline.thumbnail(orgId, videoId, job.attemptsMade + 1);
      await completeJob(prisma, guard.jobRecordId);
      logger.info({ jobId, videoId, result, module: 'render' }, 'thumbnail.completed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const terminal = (err as { terminal?: boolean })?.terminal === true;
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
      if (lastAttempt || terminal) {
        await failJob(prisma, guard.jobRecordId, msg);
      }
      throw err;
    }
  };
}
