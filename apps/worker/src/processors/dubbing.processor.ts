/** Dubbing processor — BullMQ queue 'dubbing'. */
import type { DbClient } from '@aca/database';
import type { Logger } from '@aca/logger';
import { UnrecoverableError, type Job } from 'bullmq';
import { AiService, AssetStore, DubbingService, OrgCredentialsService } from '@aca/video-engine';
import type { AppConfig } from '@aca/config';
import { beginJob, completeJob, failJob } from './job-record.js';

export function createDubbingProcessor(config: AppConfig, prisma: DbClient, logger: Logger) {
  const creds = new OrgCredentialsService(config, prisma);
  const ai = new AiService(config, creds);
  const store = new AssetStore(config, prisma);
  const pipeline = new DubbingService(config, prisma, ai, store);

  return async (job: Job<Record<string, unknown>>): Promise<void> => {
    const { id: jobId, data } = job;
    if (!jobId) throw new Error('job without id');
    const recordId = typeof data['jobRecordId'] === 'string' ? (data['jobRecordId'] as string) : null;
    const guard = await beginJob(prisma, logger, jobId, 'dubbing', recordId);
    if (guard.skip) return;
    const jobId2 = typeof data['dubbingJobId'] === 'string' ? (data['dubbingJobId'] as string) : null;
    if (!jobId2) throw new Error('dubbing payload missing dubbingJobId');
    try {
      const renditionId = await pipeline.process(jobId2, job.attemptsMade + 1);
      await completeJob(prisma, guard.jobRecordId);
      logger.info({ jobId, dubbingJobId: jobId2, renditionId, module: 'dubbing' }, 'dubbing.completed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const terminal = (err as { terminal?: boolean })?.terminal === true;
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
      if (terminal || lastAttempt) {
        await failJob(prisma, guard.jobRecordId, msg);
        if (terminal) throw new UnrecoverableError(msg);
        logger.error({ jobId, dubbingJobId: jobId2, err: msg.slice(0, 400), module: 'dubbing' }, 'dubbing.failed-terminal');
      } else {
        logger.warn({ jobId, attempt: job.attemptsMade + 1, err: msg.slice(0, 300), module: 'dubbing' }, 'dubbing.failed-retry');
      }
      throw err;
    }
  };
}
