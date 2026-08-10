/**
 * PublishService — the 'publish' queue worker: uploads a READY rendition to
 * the target platform via its Publisher provider (YouTube, TikTok, ...).
 * Providers are isolated (channels/publishers/) so adding Instagram/Facebook
 * is a single new publisher file — no core rebuild.
 *
 * If the caller asked publishNow while the render still runs, the task parks
 * (QUEUED + re-delay, ≤15×1 min) instead of burning retries. Status is always
 * user-friendly: Uploading / Published / Failed — never raw stack traces.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DbClient } from '@aca/database';
import { PRISMA } from '../../common/prisma.provider.js';
import { QueueService } from '../../common/queue/queue.service.js';
import { ChannelsService } from '../channels/channels.service.js';
import { AssetStore } from './asset-store.js';
import { createPublishers, getPublisher } from '../channels/publishers/index.js';

const MAX_DEFERS = 15;

@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);
  private readonly publishers: Map<string, import('../channels/publishers/types.js').PublisherProvider>;

  constructor(
    @Inject(PRISMA) private readonly prisma: DbClient,
    private readonly queue: QueueService,
    private readonly channels: ChannelsService,
    private readonly store: AssetStore,
  ) {
    this.publishers = createPublishers(this.prisma, this.channels);
    this.queue.registerWorker('publish', (payload) => this.process(String(payload.taskId), Number(payload.defers ?? 0)));
  }

  async process(taskId: string, defers: number): Promise<void> {
    const task = await this.prisma.publishingTask.findUnique({
      where: { id: taskId },
      include: { video: { include: { renditions: true } }, channel: true },
    });
    if (!task) throw new Error(`publishing task ${taskId} not found`);
    if (task.status === 'CANCELLED' || task.status === 'PUBLISHED') return;

    if (task.video.status !== 'READY') {
      if (defers >= MAX_DEFERS) throw new Error(`video never became READY (status=${task.video.status})`);
      await this.prisma.publishingTask.update({ where: { id: taskId }, data: { status: 'QUEUED' } });
      // queue name stays youtube.publish for backward compat; payload decides platform
      await this.queue.enqueue('publish', `${task.platform}.publish`, { taskId, defers: defers + 1 }, { delayMs: 60_000 });
      return;
    }

    const rendition = task.video.renditions[0];
    if (!rendition?.storageKey) throw new Error('video has no READY rendition file');

    await this.prisma.publishingTask.update({ where: { id: taskId }, data: { status: 'UPLOADING', attemptsMade: task.attemptsMade + 1 } });
    await this.prisma.video.update({ where: { id: task.videoId }, data: { status: 'PUBLISHING' } });

    try {
      const bytes = await this.store.read(rendition.storageKey);
      const platform = (task.platform ?? task.channel.platform ?? 'youtube').toLowerCase();
      const publisher = getPublisher(this.publishers, platform);

      this.logger.log(`Publishing ${taskId} (${platform}) via ${publisher.label} — ${bytes.byteLength} bytes`);

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

      await this.prisma.$transaction([
        this.prisma.publishingTask.update({
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
        this.prisma.video.update({ where: { id: task.videoId }, data: { status: 'PUBLISHED', publishedAt: new Date() } }),
        this.prisma.channel.update({ where: { id: task.channelId }, data: { lastSyncAt: new Date(), status: 'CONNECTED' } }),
      ]);
      this.logger.log(`Published ${taskId} → ${result.platformUrl ?? result.platformVideoId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 480) : 'publish failed';
      await this.prisma.publishingTask.update({ where: { id: taskId }, data: { status: 'FAILED', lastError: msg } });
      await this.prisma.video.update({ where: { id: task.videoId }, data: { status: 'READY' } });
      if (/token|unauthorized|401/i.test(msg)) {
        await this.prisma.channel.update({ where: { id: task.channelId }, data: { lastError: msg, status: 'TOKEN_EXPIRED' } });
      }
      this.logger.warn(`Publish ${taskId} failed: ${msg}`);
      throw err;
    }
  }
}
