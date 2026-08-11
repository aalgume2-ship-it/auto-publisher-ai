/** Image generation processor — BullMQ queue 'image-generation'. */
import type { DbClient } from '@aca/database';
import type { Logger } from '@aca/logger';
import { UnrecoverableError, type Job } from 'bullmq';
import { AiService, AssetStore, ImageGenerationService, OrgCredentialsService } from '@aca/video-engine';
import type { AppConfig } from '@aca/config';
import { beginJob, completeJob, failJob } from './job-record.js';

export function createImageProcessor(config: AppConfig, prisma: DbClient, logger: Logger) {
  const creds = new OrgCredentialsService(config, prisma);
  const ai = new AiService(config, creds);
  const store = new AssetStore(config, prisma);
  const pipeline = new ImageGenerationService(config, prisma, ai, store);

  return async (job: Job<Record<string, unknown>>): Promise<void> => {
    const { id: jobId, data } = job;
    if (!jobId) throw new Error('job without id');
    const recordId = typeof data['jobRecordId'] === 'string' ? (data['jobRecordId'] as string) : null;
    const guard = await beginJob(prisma, logger, jobId, 'image-generation', recordId);
    if (guard.skip) return;
    const genId = typeof data['imageGenerationId'] === 'string' ? (data['imageGenerationId'] as string) : null;
    if (!genId) throw new Error('image-generation payload missing imageGenerationId');
    try {
      const assetIds = await pipeline.process(genId, job.attemptsMade + 1);
      await completeJob(prisma, guard.jobRecordId);
      logger.info({ jobId, genId, assetIds, module: 'image' }, 'image-generation.completed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const terminal = (err as { terminal?: boolean })?.terminal === true;
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
      if (terminal || lastAttempt) {
        await failJob(prisma, guard.jobRecordId, msg);
        if (terminal) throw new UnrecoverableError(msg);
        logger.error({ jobId, genId, err: msg.slice(0, 400), module: 'image' }, 'image-generation.failed-terminal');
      } else {
        logger.warn({ jobId, attempt: job.attemptsMade + 1, err: msg.slice(0, 300), module: 'image' }, 'image-generation.failed-retry');
      }
      throw err;
    }
  };
}
