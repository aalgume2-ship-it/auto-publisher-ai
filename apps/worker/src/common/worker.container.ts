/**
 * Worker container — long-running queue consumer for heavy CPU-bound
 * work (FFmpeg encoding, parallel thumbnail extraction, batch dubbing).
 *
 * Architecture:
 *   The API process handles its own queue workers for `generation` and
 *   `publish` (Redis Streams — see apps/api/src/common/queue/queue.service.ts)
 *   because it owns the providers and the database transaction boundary.
 *
 *   This worker handles the `rendering` queue: jobs the API enqueues
 *   when it needs CPU work offloaded (large FFmpeg encodes, parallel
 *   thumbnail extraction, etc).
 *
 *   On AWS the worker is a separate ECS service (autocreator-worker)
 *   with the same Docker image as the API but a different command.
 *
 * Lifecycle:
 *   1. Verify Redis connection.
 *   2. Boot the rendering worker (BullMQ-style loop on a Streams
 *      consumer group with the same primitives as the API queue).
 *   3. Graceful shutdown on SIGTERM / SIGINT.
 */
import type { DbClient } from '@aca/database';
import type { AppConfig } from '@aca/config';
import type { Logger } from '@aca/logger';
import { Redis } from 'ioredis';
import { renderHeavyJob, type RenderJobPayload } from '../jobs/render.job.js';
import { parallelThumbnailsJob, type ParallelThumbnailsPayload } from '../jobs/parallel-thumbnails.job.js';

const RENDER_QUEUE = 'rendering';
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [0, 5_000, 20_000];

export class WorkerContainer {
  private redis: Redis;
  private running = false;
  private consumerTag = `worker-${process.pid}`;
  private groupName = 'rendering-workers';

  constructor(
    private config: AppConfig,
    private prisma: DbClient,
    private logger: Logger,
  ) {
    this.redis = new Redis(this.config.redis.url, { maxRetriesPerRequest: null });
  }

  async start(): Promise<void> {
    this.logger.info({ module: 'worker-container' }, 'container.start');

    const pong = await this.redis.ping();
    if (pong !== 'PONG') throw new Error('Redis connection failed');
    this.logger.info({ module: 'worker-container' }, 'redis.connected');

    const stream = `${this.config.redis.prefix}:q:${RENDER_QUEUE}:stream`;
    try {
      await this.redis.xgroup('CREATE', stream, this.groupName, '$', 'MKSTREAM');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/BUSYGROUP/.test(msg)) throw e;
    }

    this.running = true;
    void this.loop(stream).catch((e) => {
      this.logger.error({ err: e, module: 'worker-container' }, 'loop.crashed');
    });
    this.logger.info({ module: 'worker-container' }, 'worker.ready');
  }

  private async loop(stream: string): Promise<void> {
    while (this.running) {
      let resp: Array<[string, Array<[string, string[]]>]> | null = null;
      try {
        resp = (await this.redis.xreadgroup(
          'GROUP',
          this.groupName,
          this.consumerTag,
          'COUNT',
          4,
          'BLOCK',
          1000,
          'STREAMS',
          stream,
          '>',
        )) as any;
      } catch (e) {
        this.logger.warn({ err: e, module: 'worker-container' }, 'xreadgroup.failed');
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      if (!resp) continue;
      for (const [, entries] of resp) {
        for (const [id, fields] of entries) {
          await this.handle(stream, id, fields);
        }
      }
    }
  }

  private async handle(stream: string, id: string, fields: string[]): Promise<void> {
    const payload = parseFields(fields);
    const attempt = Number(payload.attempt ?? 1);
    const jobType = String(payload.type ?? '');

    this.logger.info({ id, type: jobType, attempt, module: 'worker-container' }, 'job.received');

    try {
      switch (jobType) {
        case 'render.heavy':
          await renderHeavyJob(this.config, this.prisma, this.logger, payload as unknown as RenderJobPayload);
          break;
        case 'thumbnails.parallel':
          await parallelThumbnailsJob(
            this.config,
            this.prisma,
            this.logger,
            payload as unknown as ParallelThumbnailsPayload,
          );
          break;
        default:
          throw new Error(`unknown job type: ${jobType || '(empty)'}`);
      }
      await this.redis.xack(stream, this.groupName, id);
      this.logger.info({ id, type: jobType, module: 'worker-container' }, 'job.completed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error({ id, type: jobType, attempt, err: msg, module: 'worker-container' }, 'job.failed');
      await this.redis.xack(stream, this.groupName, id);
      if (attempt < MAX_ATTEMPTS) {
        const backoff = RETRY_BACKOFF_MS[attempt] ?? 30_000;
        await new Promise((r) => setTimeout(r, backoff));
        const nextPayload = { ...payload, attempt: String(attempt + 1) };
        await this.redis.xadd(
          stream,
          '*',
          ...Object.entries(nextPayload).flatMap(([k, v]) => [k, String(v)]),
        );
      } else {
        this.logger.error({ id, type: jobType, module: 'worker-container' }, 'job.dead_lettered');
      }
    }
  }

  async stop(): Promise<void> {
    this.logger.info({ module: 'worker-container' }, 'container.stop');
    this.running = false;
    try {
      await this.redis.quit();
    } catch (e) {
      this.logger.warn({ err: e, module: 'worker-container' }, 'redis.quit.failed');
    }
  }
}

function parseFields(fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    out[fields[i]!] = fields[i + 1] ?? '';
  }
  return out;
}
