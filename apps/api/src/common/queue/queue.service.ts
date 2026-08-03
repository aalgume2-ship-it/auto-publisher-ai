/**
 * PlatformQueue — the real queue engine behind generation/publishing
 * (Roadmap Phase-1 'workers'). Redis Streams + a ZSET for delayed jobs:
 * exactly the BullMQ primitive set (durable queue, delay, consumer groups,
 * retry, dead state) implemented directly on Streams so it runs correctly on
 * the managed free-tier Redis (whose eviction policy BullMQ forbids).
 *
 * Durability model:
 *   enqueue       → JobRecord(QUEUED) + ZADD delayed   (delay) | XADD (now)
 *   schedulerLoop → due delayed jobs → XADD stream
 *   consumerLoop  → XREADGROUP (new) + XAUTOCLAIM (crashed) → process → XACK
 *   failure       → attemptsMade++ < MAX → ZADD retry with backoff, else FAILED
 * Every state transition is mirrored to JobRecord rows (single source of
 * truth for the UI/API) so a Redis flush never loses a job's audit trail.
 */
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '@aca/config';
import { generateId, type DbClient } from '@aca/database';
import { PRISMA } from '../prisma.provider.js';
import { API_CONFIG } from '../redis.provider.js';

export type QueueName = 'generation' | 'publish';
export type JobHandler = (payload: Record<string, unknown>, jobId: string) => Promise<void>;

const GROUP = 'workers';
const CONSUMER = `api-${process.pid}`;
const MAX_ATTEMPTS = 3;
const BLOCK_MS = 5_000;
const CLAIM_IDLE_MS = 120_000; // reclaim jobs from a dead consumer after 2 min

interface EnqueueOpts {
  /** Delay in ms before the job becomes visible (scheduled publishing). */
  delayMs?: number;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private io: Redis | null = null;     // blocking reader (dedicated connection)
  private out: Redis | null = null;    // commands (dedicated connection)
  private handlers = new Map<string, JobHandler>();
  private stops: Array<() => void> = [];
  private running = false;

  constructor(
    @Inject(API_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: DbClient,
  ) {}

  private stream(queue: string): string {
    return `${this.config.redis.prefix}:q:${queue}:stream`;
  }
  private delayed(queue: string): string {
    return `${this.config.redis.prefix}:q:${queue}:delayed`;
  }

  /** Register a worker handler BEFORE boot (modules call this in constructor). */
  registerWorker(queue: QueueName, handler: JobHandler): void {
    this.handlers.set(queue, handler);
  }

  async boot(): Promise<void> {
    if (this.running || this.handlers.size === 0) return;
    this.running = true;
    const url = this.config.redis.url;
    // ioredis keyPrefix is NOT used here (explicit keys keep XAUTOCLAIM sane).
    this.io = new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: true });
    this.out = new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: true });
    for (const queue of this.handlers.keys()) {
      try {
        await this.io.xgroup('CREATE', this.stream(queue), GROUP, '0', 'MKSTREAM');
      } catch (e) {
        // BUSYGROUP = already exists (expected on every reboot)
        if (!(e instanceof Error && e.message.includes('BUSYGROUP'))) throw e;
      }
      this.loopScheduler(queue);
      this.loopConsumer(queue);
    }
  }

  async onModuleInit(): Promise<void> {
    // Boot lazily AFTER modules registered their workers (Nest calls all
    // onModuleInit in module order; CommonModule loads first, so defer to a
    // macrotask so feature modules have registered handlers by then).
    setImmediate(() => {
      void this.boot().catch((err) => {
        // Queue infra failure must NEVER take the HTTP surface down (health
        // already reports redis); the API keeps serving without workers.
        console.error('[queue] boot failed — workers offline:', err);
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    for (const stop of this.stops) stop();
    this.stops = [];
    this.io?.disconnect();
    this.out?.disconnect();
    this.io = null;
    this.out = null;
  }

  /** Enqueue a durable job; returns the platform job id (JobRecord.bullJobId). */
  async enqueue(queue: QueueName, name: string, payload: Record<string, unknown>, opts: EnqueueOpts = {}): Promise<string> {
    const jobId = `${queue}:${randomUUID()}`;
    const rec = await this.prisma.jobRecord.create({
      data: {
        id: generateId(),
        bullJobId: jobId,
        queue,
        name,
        payload: payload as object,
        status: opts.delayMs && opts.delayMs > 0 ? 'DELAYED' : 'QUEUED',
      },
    });
    if (this.out === null) throw new Error('queue engine not booted');
    if (opts.delayMs && opts.delayMs > 0) {
      await this.out.zadd(this.delayed(queue), Date.now() + opts.delayMs, jobId);
    } else {
      await this.xaddJob(queue, jobId, rec.id);
    }
    return jobId;
  }

  private async xaddJob(queue: string, jobId: string, recordId: string): Promise<void> {
    await this.out!.xadd(this.stream(queue), '*', 'jobId', jobId, 'recordId', recordId);
  }

  /** Moves due delayed jobs into the stream (1s tick — cheap ZRANGEBYSCORE). */
  private loopScheduler(queue: string): void {
    let timer: NodeJS.Timeout;
    const tick = async () => {
      if (!this.running) return;
      try {
        const due = await this.out!.zrangebyscore(this.delayed(queue), '-inf', Date.now(), 'LIMIT', 0, 32);
        for (const jobId of due) {
          const removed = await this.out!.zrem(this.delayed(queue), jobId);
          if (removed === 1) {
            const rec = await this.prisma.jobRecord.findUnique({ where: { bullJobId: jobId } });
            if (rec && (rec.status === 'DELAYED' || rec.status === 'QUEUED')) {
              await this.prisma.jobRecord.update({ where: { id: rec.id }, data: { status: 'QUEUED' } });
              await this.xaddJob(queue, jobId, rec.id);
            }
          }
        }
      } catch (err) {
        console.error(`[queue] scheduler(${queue}) tick error:`, err);
      }
      timer = setTimeout(tick, 1_000);
    };
    timer = setTimeout(tick, 1_000);
    this.stops.push(() => clearTimeout(timer));
  }

  /** Durable consumer: new work via XREADGROUP, abandoned work via XAUTOCLAIM. */
  private loopConsumer(queue: string): void {
    const handler = this.handlers.get(queue);
    if (!handler) return;
    const run = async () => {
      while (this.running) {
        try {
          // 1) reclaim abandoned entries (crashed consumer / process restart)
          const claimed = (await this.io!.xautoclaim(
            this.stream(queue), GROUP, CONSUMER, CLAIM_IDLE_MS, '0', 'COUNT', 8,
          )) as [string, Array<[string, string[]]>, unknown];
          for (const [entryId, fields] of claimed[1] ?? []) {
            await this.processOne(queue, entryId, fields, handler);
          }
          // 2) new entries
          const res = (await this.io!.xreadgroup(
            'GROUP', GROUP, CONSUMER, 'COUNT', 4, 'BLOCK', BLOCK_MS, 'STREAMS', this.stream(queue), '>',
          )) as Array<[string, Array<[string, string[]]>]> | null;
          for (const [, entries] of res ?? []) {
            for (const [entryId, fields] of entries) {
              await this.processOne(queue, entryId, fields, handler);
            }
          }
        } catch (err) {
          if (this.running) {
            console.error(`[queue] consumer(${queue}) loop error:`, err);
            await new Promise((r) => setTimeout(r, 2_000));
          }
        }
      }
    };
    void run();
    this.stops.push(() => {
      /* running flag stops the loop */
    });
  }

  private async processOne(queue: string, entryId: string, fields: string[], handler: JobHandler): Promise<void> {
    const get = (k: string): string | undefined => {
      const i = fields.indexOf(k);
      return i >= 0 ? fields[i + 1] : undefined;
    };
    const jobId = get('jobId');
    const recordId = get('recordId');
    if (!jobId) return;
    const rec = recordId
      ? await this.prisma.jobRecord.findUnique({ where: { id: recordId } })
      : await this.prisma.jobRecord.findUnique({ where: { bullJobId: jobId } });
    if (!rec || rec.status === 'COMPLETED' || rec.status === 'FAILED' || rec.status === 'CANCELLED') {
      await this.io!.xack(this.stream(queue), GROUP, entryId);
      return;
    }
    await this.prisma.jobRecord.update({
      where: { id: rec.id },
      data: { status: 'ACTIVE', attemptsMade: { increment: 1 }, processedAt: new Date() },
    });
    try {
      await handler(rec.payload as Record<string, unknown>, jobId);
      await this.prisma.jobRecord.update({ where: { id: rec.id }, data: { status: 'COMPLETED', finishedAt: new Date() } });
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 500) : 'unknown error';
      const attempts = rec.attemptsMade + 1;
      if (attempts < MAX_ATTEMPTS) {
        const backoffMs = 10_000 * 2 ** (attempts - 1); // 10s → 20s
        await this.prisma.jobRecord.update({
          where: { id: rec.id },
          data: { status: 'DELAYED', failedReason: `attempt ${attempts}: ${msg}` },
        });
        await this.out!.zadd(this.delayed(queue), Date.now() + backoffMs, jobId);
      } else {
        await this.prisma.jobRecord.update({
          where: { id: rec.id },
          data: { status: 'FAILED', failedReason: msg, finishedAt: new Date() },
        });
      }
    }
    await this.io!.xack(this.stream(queue), GROUP, entryId);
  }
}

export const QUEUE_PROVIDER = 'ACA_QUEUE';
