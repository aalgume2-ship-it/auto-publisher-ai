/**
 * Generation processor — the REAL video pipeline (BullMQ queue 'generation').
 * Payloads:
 *   { videoId }                     — direct studio generation
 *   { campaignPostId, keyword, … }  — campaign automation (creates the video
 *                                      row first, then continues to publish)
 */
import type { DbClient } from '@aca/database';
import type { Logger } from '@aca/logger';
import { UnrecoverableError, type Job, type Queue as BullQueue } from 'bullmq';
import { generateId } from '@aca/database';
import { GenerationService, AiService, AssetStore, VideoComposer, OrgCredentialsService } from '@aca/video-engine';
import type { AppConfig } from '@aca/config';
import { beginJob, completeJob, failJob } from './job-record.js';

export function createGenerationProcessor(
  config: AppConfig,
  prisma: DbClient,
  logger: Logger,
  publishQueue: BullQueue,
) {
  const creds = new OrgCredentialsService(config, prisma);
  const ai = new AiService(config, creds);
  const store = new AssetStore(config, prisma);
  const composer = new VideoComposer();
  const pipeline = new GenerationService(config, prisma, ai, store, composer);

  return async (job: Job<Record<string, unknown>>): Promise<void> => {
    const { id: jobId, data } = job;
    if (!jobId) throw new Error('job without id');
    const recordId = typeof data['jobRecordId'] === 'string' ? (data['jobRecordId'] as string) : null;
    const guard = await beginJob(prisma, logger, jobId, 'generation', recordId);
    if (guard.skip) return;

    try {
      let videoId = typeof data['videoId'] === 'string' ? (data['videoId'] as string) : null;

      // Campaign automation: create the video row (and a project if needed).
      const campaignPostId = typeof data['campaignPostId'] === 'string' ? (data['campaignPostId'] as string) : null;
      if (!videoId && campaignPostId) {
        const post = await prisma.campaignPost.findUnique({ where: { id: campaignPostId } });
        if (!post) throw new Error(`campaign post ${campaignPostId} not found`);
        let project = await prisma.project.findFirst({ where: { orgId: post.orgId, name: 'Campaigns' } });
        if (!project) {
          project = await prisma.project.create({
            data: {
              id: generateId(),
              orgId: post.orgId,
              name: 'Campaigns',
              niche: 'campaign',
              language: 'ar',
              targetPlatforms: [],
              aspectRatio: 'RATIO_9_16',
              stylePreset: {},
            },
          });
        }
        const keyword =
          (typeof data['keyword'] === 'string' && data['keyword'] ? (data['keyword'] as string) : '') ||
          `Automated post for ${post.platform}`;
        const video = await prisma.video.create({
          data: {
            id: generateId(),
            orgId: post.orgId,
            projectId: project.id,
            title: keyword.slice(0, 120),
            language: 'ar',
            targetPlatforms: [post.platform],
            seo: { keyword, targetSeconds: 40, campaignPostId },
          },
        });
        videoId = video.id;
      }
      if (!videoId) throw new Error('generation payload missing videoId');

      const attempt = job.attemptsMade + 1;
      await pipeline.process(videoId, attempt);

      // Campaign continuation: mark post READY + enqueue publish when a channel exists.
      if (campaignPostId) {
        const post = await prisma.campaignPost.findUnique({ where: { id: campaignPostId } });
        if (post) {
          await prisma.campaignPost.update({ where: { id: post.id }, data: { status: 'READY', videoId } });
          const channel = await prisma.channel.findFirst({
            where: { orgId: post.orgId, platform: post.platform, status: 'CONNECTED' },
            select: { id: true },
          });
          if (channel && post.scheduledFor) {
            const task = await prisma.publishingTask.create({
              data: {
                id: generateId(),
                orgId: post.orgId,
                videoId,
                channelId: channel.id,
                platform: post.platform,
                renditionProfile: 'shorts-720x1280',
                scheduledAt: post.scheduledFor,
                hashtags: post.hashtags,
              },
            });
            await publishQueue.add('campaign.publish', { taskId: task.id }, { delay: Math.max(0, post.scheduledFor.getTime() - Date.now()) });
            await prisma.campaignPost.update({
              where: { id: post.id },
              data: { status: 'SCHEDULED', publishedTaskId: task.id },
            });
          }
        }
      }

      await completeJob(prisma, guard.jobRecordId);
      logger.info({ jobId, videoId, module: 'generation' }, 'generation.completed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const terminal = (err as { terminal?: boolean })?.terminal === true;
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
      if (terminal || lastAttempt) {
        await failJob(prisma, guard.jobRecordId, msg);
        if (terminal) throw new UnrecoverableError(msg);
        logger.error({ jobId, err: msg.slice(0, 400), module: 'generation' }, 'generation.failed-terminal');
      } else {
        logger.warn({ jobId, attempt: job.attemptsMade + 1, err: msg.slice(0, 300), module: 'generation' }, 'generation.failed-retry');
      }
      throw err; // let BullMQ retry (or mark failed at max attempts)
    }
  };
}
