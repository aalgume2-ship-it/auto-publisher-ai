/**
 * PublishService — the 'publish' queue worker: uploads a READY rendition to
 * YouTube with the channel's vaulted credential (auto-refresh) via the REAL
 * resumable Upload API (uploadType=resumable → session URI → PUT bytes).
 * If the caller asked publishNow while the render still runs, the task parks
 * (QUEUED + re-delay, ≤15×1 min) instead of burning retries.
 */
import { Injectable } from '@nestjs/common';
import type { DbClient } from '@aca/database';
import { Inject } from '@nestjs/common';
import { PRISMA } from '../../common/prisma.provider.js';
import { QueueService } from '../../common/queue/queue.service.js';
import { ChannelsService } from '../channels/channels.service.js';
import { AssetStore } from './asset-store.js';

const UPLOAD_INIT = 'https://upload.googleapis.com/upload/youtube/v3/videos';
const MAX_DEFERS = 15;

@Injectable()
export class PublishService {
  constructor(
    @Inject(PRISMA) private readonly prisma: DbClient,
    private readonly queue: QueueService,
    private readonly channels: ChannelsService,
    private readonly store: AssetStore,
  ) {
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
      await this.queue.enqueue('publish', 'youtube.publish', { taskId, defers: defers + 1 }, { delayMs: 60_000 });
      return;
    }

    const rendition = task.video.renditions[0];
    if (!rendition?.storageKey) throw new Error('video has no READY rendition file');

    await this.prisma.publishingTask.update({ where: { id: taskId }, data: { status: 'UPLOADING', attemptsMade: task.attemptsMade + 1 } });
    await this.prisma.video.update({ where: { id: task.videoId }, data: { status: 'PUBLISHING' } });

    try {
      const token = await this.channels.freshAccessToken(task.channelId);
      const bytes = await this.store.read(rendition.storageKey);

      // 1) initiate the resumable session (metadata JSON)
      const init = await fetch(`${UPLOAD_INIT}?uploadType=resumable&part=snippet,status`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-type': 'video/mp4',
          'x-upload-content-length': String(bytes.byteLength),
        },
        body: JSON.stringify({
          snippet: {
            title: task.titleOverride ?? task.video.title,
            description: task.descriptionOverride ?? task.video.description ?? '',
            tags: task.video.tags,
            categoryId: '22',
          },
          status: { privacyStatus: task.video.visibilityDefault, selfDeclaredMadeForKids: false },
        }),
      });
      const sessionUri = init.headers.get('location');
      if (init.status !== 200 || !sessionUri) {
        throw new Error(`youtube upload session ${init.status}: ${(await init.text()).slice(0, 300)}`);
      }

      // 2) single-shot upload of the full file
      const put = await fetch(sessionUri, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.byteLength) }, body: new Uint8Array(bytes) });
      const putBody = (await put.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
      if (put.status !== 200 && put.status !== 201) {
        throw new Error(`youtube upload ${put.status}: ${putBody?.error?.message ?? 'upload failed'}`);
      }
      const platformVideoId = putBody?.id ?? null;
      const platformUrl = platformVideoId ? `https://youtu.be/${platformVideoId}` : null;

      await this.prisma.$transaction([
        this.prisma.publishingTask.update({
          where: { id: taskId },
          data: { status: 'PUBLISHED', platformVideoId, platformUrl, publishedAt: new Date(), lastError: null },
        }),
        this.prisma.video.update({ where: { id: task.videoId }, data: { status: 'PUBLISHED', publishedAt: new Date() } }),
        this.prisma.channel.update({ where: { id: task.channelId }, data: { lastSyncAt: new Date(), status: 'CONNECTED' } }),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 480) : 'publish failed';
      await this.prisma.publishingTask.update({ where: { id: taskId }, data: { status: 'FAILED', lastError: msg } });
      await this.prisma.video.update({ where: { id: task.videoId }, data: { status: 'READY' } }); // re-schedulable
      // Token problems flag the channel for the UI (TOKEN_EXPIRED on repeated failure).
      if (/token|unauthorized|401/i.test(msg)) {
        await this.prisma.channel.update({ where: { id: task.channelId }, data: { lastError: msg, status: 'TOKEN_EXPIRED' } });
      }
      throw err;
    }
  }
}
