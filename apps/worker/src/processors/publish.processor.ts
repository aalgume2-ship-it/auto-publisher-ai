/**
 * Publish processor — BullMQ queue 'publish'.
 * Uploads a READY rendition to the target platform via its real Publisher
 * provider (YouTube resumable upload / TikTok direct post / Instagram Graph).
 * If the video is still rendering, the task parks (re-delay) instead of
 * burning retries. Provider/credential failures land as FAILED + channel
 * TOKEN_EXPIRED — never silent.
 */
import type { DbClient } from '@aca/database';
import type { Logger } from '@aca/logger';
import type { Job } from 'bullmq';
import type { AppConfig } from '@aca/config';
import { AssetStore } from '@aca/video-engine';
// Reuse the API's channel vault + publisher implementations (single source of truth).
import { OrgCredentialsService } from '@aca/api/credentials';
import { ChannelsService } from '@aca/api/channels';
import { createPublishers } from '@aca/api/publish';
import { beginJob, completeJob, failJob } from './job-record.js';

const MAX_DEFERS = 15;

export function createPublishProcessor(config: AppConfig, prisma: DbClient, logger: Logger) {
  const creds = new OrgCredentialsService(config, prisma);
  const channels = new ChannelsService(config, prisma, creds);
  const store = new AssetStore(config, prisma);
  const publishers = createPublishers(prisma, channels);

  return async (job: Job<Record<string, unknown>>): Promise<void> => {
    const { id: jobId, data } = job;
    if (!jobId) throw new Error('job without id');
    const recordId = typeof data['jobRecordId'] === 'string' ? (data['jobRecordId'] as string) : null;
    const guard = await beginJob(prisma, logger, jobId, 'publish', recordId);
    if (guard.skip) return;

    const taskId = typeof data['taskId'] === 'string' ? (data['taskId'] as string) : null;
    const defers = typeof data['defers'] === 'number' ? (data['defers'] as number) : 0;
    if (!taskId) throw new Error('publish payload missing taskId');

    try {
      const task = await prisma.publishingTask.findUnique({
        where: { id: taskId },
        include: { video: { include: { renditions: true } }, channel: true },
      });
      if (!task) throw new Error(`publishing task ${taskId} not found`);
      if (task.status === 'CANCELLED' || task.status === 'PUBLISHED') {
        await completeJob(prisma, guard.jobRecordId);
        return;
      }

      if (task.video.status !== 'READY') {
        if (defers >= MAX_DEFERS) throw new Error(`video never became READY (status=${task.video.status})`);
        await prisma.publishingTask.update({ where: { id: taskId }, data: { status: 'QUEUED' } });
        await job.moveToDelayed(Date.now() + 60_000); // park 60s, same BullMQ job
        logger.info({ jobId, taskId, defer: defers + 1, module: 'publish' }, 'publish.deferred-video-not-ready');
        return;
      }

      const rendition = task.video.renditions[0];
      if (!rendition?.storageKey) throw new Error('video has no READY rendition file');

      await prisma.publishingTask.update({ where: { id: taskId }, data: { status: 'UPLOADING', attemptsMade: task.attemptsMade + 1 } });
      await prisma.video.update({ where: { id: task.videoId }, data: { status: 'PUBLISHING' } });

      try {
        const bytes = await store.read(rendition.storageKey);
        const platform = (task.platform ?? task.channel.platform ?? 'youtube').toLowerCase();
        const publisher = publishers.get(platform);
        if (!publisher) {
          throw new Error(
            `No publisher registered for platform: ${platform} — available: ${Array.from(publishers.keys()).join(', ')}. ` +
              'Connect the platform channel first.',
          );
        }

        logger.info({ jobId, taskId, platform, bytes: bytes.byteLength, module: 'publish' }, 'publish.start');
        const result = await publisher.publish({
          channelId: task.channelId,
          orgId: task.orgId,
          videoId: task.videoId,
          title: task.titleOverride ?? task.video.title,
          description: task.descriptionOverride ?? task.video.description ?? '',
          tags: task.video.tags ?? [],
          privacy: task.video.visibilityDefault ?? 'public',
          videoBytes: bytes,
          caption: task.titleOverride ?? task.video.title,
        });

        await prisma.$transaction([
          prisma.publishingTask.update({
            where: { id: taskId },
            data: {
              status: 'PUBLISHED',
              platformVideoId: result.platformVideoId,
              platformUrl: result.platformUrl,
              platformPostId: result.platformPostId ?? result.platformVideoId,
              publishedAt: new Date(),
              lastError: null,
            },
          }),
          prisma.video.update({ where: { id: task.videoId }, data: { status: 'PUBLISHED', publishedAt: new Date() } }),
          prisma.channel.update({ where: { id: task.channelId }, data: { lastSyncAt: new Date(), status: 'CONNECTED' } }),
        ]);
        await completeJob(prisma, guard.jobRecordId);
        logger.info({ jobId, taskId, platform, url: result.platformUrl ?? result.platformVideoId, module: 'publish' }, 'publish.completed');
      } catch (err) {
        const msg = err instanceof Error ? err.message.slice(0, 480) : 'publish failed';
        await prisma.publishingTask.update({ where: { id: taskId }, data: { status: 'FAILED', lastError: msg } });
        await prisma.video.update({ where: { id: task.videoId }, data: { status: 'READY' } });
        if (/token|unauthorized|401|expired/i.test(msg)) {
          await prisma.channel.update({ where: { id: task.channelId }, data: { lastError: msg, status: 'TOKEN_EXPIRED' } });
        }
        await failJob(prisma, guard.jobRecordId, msg);
        logger.warn({ jobId, taskId, err: msg, module: 'publish' }, 'publish.failed');
        throw err;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
      if (lastAttempt) await failJob(prisma, guard.jobRecordId, msg);
      throw err;
    }
  };
}
