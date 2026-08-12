/**
 * WorkerContainer — composition root: BullMQ workers for all six queues,
 * campaign scheduler, dead-letter wiring, and a tiny health HTTP server for
 * ECS target-group checks (/health/live, /health/ready).
 */
import type { DbClient } from '@aca/database';
import type { AppConfig } from '@aca/config';
import type { Logger } from '@aca/logger';
import { Redis } from 'ioredis';
import { Worker, Queue, type Job } from 'bullmq';
import * as http from 'node:http';
import { createGenerationProcessor } from '../processors/generation.processor.js';
import { createImageProcessor } from '../processors/image.processor.js';
import { createDubbingProcessor } from '../processors/dubbing.processor.js';
import { createPublishProcessor } from '../processors/publish.processor.js';
import { createRenderProcessor, createThumbnailProcessor } from '../processors/render.processor.js';
import { CampaignScheduler } from '../processors/campaign.scheduler.js';
import { deadLetter } from '../processors/job-record.js';
import { verifyMediaRuntime } from '@aca/video-engine';

const QUEUES = ['generation', 'image-generation', 'dubbing', 'publish', 'render', 'thumbnail'] as const;

export class WorkerContainer {
  private redis: Redis;
  private connection: Redis;
  private workers: Worker[] = [];
  private producers: Map<string, Queue> = new Map();
  private scheduler: CampaignScheduler;
  private healthServer: http.Server | null = null;
  private mediaRuntimeReady = false;

  constructor(
    private config: AppConfig,
    private prisma: DbClient,
    private logger: Logger,
  ) {
    this.redis = new Redis(this.config.redis.url); // ops connection (DLQ etc.)
    this.connection = new Redis(this.config.redis.url, { maxRetriesPerRequest: null, enableReadyCheck: true });
    this.scheduler = new CampaignScheduler(this.prisma, this.logger, this.producers.get('generation') as unknown as Queue);
  }

  private key(queue: string): string {
    // BullMQ forbids ':' inside queue names — use '_q_' separator.
    return `${this.config.redis.prefix}_q_${queue}`;
  }

  async start(): Promise<void> {
    this.logger.debug({ module: 'worker-container' }, 'container.start');

    // 1) Verify Redis
    const pong = await this.redis.ping();
    if (pong !== 'PONG') throw new Error('Redis connection failed');
    this.logger.info({ module: 'worker-container' }, 'redis.connected');

    // 2) Verify Postgres
    await this.prisma.$queryRawUnsafe('SELECT 1');
    this.logger.info({ module: 'worker-container' }, 'postgres.connected');

    // Rendering is a required worker capability, not an optional late failure.
    await verifyMediaRuntime();
    this.mediaRuntimeReady = true;
    this.logger.info({ module: 'worker-container' }, 'media-runtime.ready');

    // 3) Producers (campaign scheduler re-enqueues generation jobs)
    for (const q of QUEUES) {
      this.producers.set(q, new Queue(this.key(q), { connection: this.connection }));
    }
    this.scheduler = new CampaignScheduler(this.prisma, this.logger, this.producers.get('generation')!);

    const onFailed = (queue: string) => async (job: Job | undefined, err: Error) => {
      if (!job) return;
      const msg = err instanceof Error ? err.message : String(err);
      const isFinal = job.attemptsMade >= (job.opts.attempts ?? 3);
      if (isFinal) {
        // Only the FINAL failure goes to the dead-letter list + FAILED record.
        // Intermediate attempts keep the JobRecord DELAYED/QUEUED so BullMQ
        // retries actually re-enter the processor (never skip via FAILED).
        await deadLetter(this.redis, this.config.redis.prefix, queue, job.id ?? '', job.name ?? '', job.data, msg);
        const recordId = typeof job.data?.['jobRecordId'] === 'string' ? (job.data['jobRecordId'] as string) : null;
        if (recordId) {
          const rec = await this.prisma.jobRecord.findUnique({ where: { id: recordId } });
          if (rec && rec.status !== 'FAILED' && rec.status !== 'COMPLETED') {
            await this.prisma.jobRecord.update({ where: { id: rec.id }, data: { status: 'FAILED', failedReason: msg.slice(0, 500), finishedAt: new Date() } });
          }
        }
        this.logger.error({ queue, jobId: job.id, err: msg.slice(0, 400), module: 'worker-container' }, 'queue.job.failed-terminal');
      } else {
        this.logger.warn({ queue, jobId: job.id, attempt: job.attemptsMade, err: msg.slice(0, 300), module: 'worker-container' }, 'queue.job.failed-retrying');
      }
    };

    // 4) Workers — one per queue, real processors, retries from QueueService
    const gen = new Worker(this.key('generation'), createGenerationProcessor(this.config, this.prisma, this.logger, this.producers.get('publish')!), {
      connection: this.connection,
      concurrency: 1,
      lockDuration: 15 * 60_000,
    });
    const img = new Worker(this.key('image-generation'), createImageProcessor(this.config, this.prisma, this.logger), {
      connection: this.connection,
      concurrency: 2,
      lockDuration: 10 * 60_000,
    });
    const dub = new Worker(this.key('dubbing'), createDubbingProcessor(this.config, this.prisma, this.logger), {
      connection: this.connection,
      concurrency: 1,
      lockDuration: 15 * 60_000,
    });
    const pub = new Worker(this.key('publish'), createPublishProcessor(this.config, this.prisma, this.logger), {
      connection: this.connection,
      concurrency: 1,
      lockDuration: 15 * 60_000,
    });
    const rnd = new Worker(this.key('render'), createRenderProcessor(this.config, this.prisma, this.logger), {
      connection: this.connection,
      concurrency: 1,
      lockDuration: 15 * 60_000,
    });
    const thb = new Worker(this.key('thumbnail'), createThumbnailProcessor(this.config, this.prisma, this.logger), {
      connection: this.connection,
      concurrency: 2,
      lockDuration: 5 * 60_000,
    });
    this.workers = [gen, img, dub, pub, rnd, thb];

    gen.on('failed', onFailed('generation'));
    img.on('failed', onFailed('image-generation'));
    dub.on('failed', onFailed('dubbing'));
    pub.on('failed', onFailed('publish'));
    rnd.on('failed', onFailed('render'));
    thb.on('failed', onFailed('thumbnail'));

    for (const w of this.workers) {
      w.on('error', (err) => this.logger.error({ err: String(err), module: 'worker-container' }, 'queue.worker.error'));
      w.on('ready', () => this.logger.info({ queue: w.name, module: 'worker-container' }, 'queue.worker.ready'));
    }

    // 5) Campaign scheduler (automation engine)
    this.scheduler.start();

    // 6) Health server for ECS target groups / k8s probes
    await this.startHealthServer();

    this.logger.info({ queues: QUEUES.map((q) => this.key(q)), module: 'worker-container' }, 'worker.ready');
  }

  private startHealthServer(): Promise<void> {
    const port = Number(process.env.PORT || 8080);
    const host = process.env.HOST || '0.0.0.0';
    this.healthServer = http.createServer(async (req, res) => {
      const url = req.url ?? '/';
      const json = (code: number, body: unknown) => {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      try {
        if (url === '/health' || url.startsWith('/health/live')) {
          json(200, { status: 'alive', service: 'apps/worker', timestamp: new Date().toISOString() });
          return;
        }
        if (url.startsWith('/health/ready')) {
          const redisPong = await this.redis.ping().catch(() => 'NO');
          await this.prisma.$queryRawUnsafe('SELECT 1');
          const waiting: number[] = [];
          for (const q of this.producers.values()) {
            waiting.push(await q.getWaitingCount().catch(() => 0));
          }
          const ready = redisPong === 'PONG' && this.mediaRuntimeReady;
          json(ready ? 200 : 503, {
            status: ready ? 'ready' : 'not_ready',
            service: 'apps/worker',
            checks: {
              redis: redisPong === 'PONG' ? 'up' : 'down',
              postgres: 'up',
              ffmpeg: this.mediaRuntimeReady ? 'up' : 'down',
              ffprobe: this.mediaRuntimeReady ? 'up' : 'down',
              queuesWaiting: waiting,
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
        json(200, { status: 'ok', service: 'apps/worker' });
      } catch (err) {
        json(503, { status: 'not_ready', error: err instanceof Error ? err.message : String(err) });
      }
    });
    return new Promise<void>((resolve, reject) => {
      this.healthServer!.once('error', reject);
      this.healthServer!.listen(port, host, () => {
        this.logger.info({ port, module: 'worker-container' }, 'worker.health.server.listening');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.logger.debug({ module: 'worker-container' }, 'container.stop');
    await this.scheduler.stop();
    await Promise.all(this.workers.map((w) => w.close().catch(() => undefined)));
    this.workers = [];
    await Promise.all(Array.from(this.producers.values()).map((q) => q.close().catch(() => undefined)));
    this.producers.clear();
    if (this.healthServer) {
      await new Promise<void>((resolve) => this.healthServer!.close(() => resolve()));
      this.healthServer = null;
    }
    await this.connection.quit().catch(() => undefined);
    await this.redis.quit().catch(() => undefined);
  }
}
