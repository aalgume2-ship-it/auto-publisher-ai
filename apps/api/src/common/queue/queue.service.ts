/**
 * PlatformQueue — the real queue engine behind generation/publishing.
 *
 * Producer side (API): enqueues durable jobs into BullMQ queues backed by
 * the production Redis (ElastiCache on AWS). Consumers live in apps/worker
 * (BullMQ Worker processes) — the API never processes jobs itself.
 *
 * Durability model:
 *   enqueue → JobRecord(QUEUED/DELAYED) row + Queue.add (jobId = record key)
 *   worker  → ACTIVE → COMPLETED | FAILED (with queue-level retry/backoff)
 *   final failure → copied to the dead-letter list aca:dlq:<queue> by the worker
 * Every state transition is mirrored to JobRecord rows (single source of
 * truth for the UI/API) so a Redis flush never loses a job's audit trail.
 */
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue as BullQueue } from 'bullmq';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '@aca/config';
import { generateId, type DbClient } from '@aca/database';
import { PRISMA } from '../prisma.provider.js';
import { API_CONFIG } from '../redis.provider.js';

/** Queue names — the canonical set consumed by apps/worker. */
export type QueueName = 'generation' | 'image-generation' | 'dubbing' | 'publish' | 'render' | 'thumbnail';

export const QUEUE_NAMES: readonly QueueName[] = ['generation', 'image-generation', 'dubbing', 'publish', 'render', 'thumbnail'];

/** Max attempts per queue (matches worker-side attempts). */
const QUEUE_ATTEMPTS: Record<QueueName, number> = {
  generation: 3,
  'image-generation': 3,
  dubbing: 3,
  publish: 3,
  render: 3,
  thumbnail: 3,
};

interface EnqueueOpts {
  /** Delay in ms before the job becomes visible (scheduled publishing). */
  delayMs?: number;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private queues = new Map<QueueName, BullQueue>();
  private connection: Redis | null = null;

  constructor(
    @Inject(API_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: DbClient,
  ) {}

  private key(queue: QueueName): string {
    // BullMQ forbids ':' inside queue names — use '_q_' separator.
    return `${this.config.redis.prefix}_q_${queue}`;
  }

  async onModuleInit(): Promise<void> {
    this.connection = new Redis(this.config.redis.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    for (const name of QUEUE_NAMES) {
      const queue = new BullQueue(this.key(name), {
        connection: this.connection,
        defaultJobOptions: {
          attempts: QUEUE_ATTEMPTS[name],
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 1_000 },
        },
      });
      this.queues.set(name, queue);
    }
    // Fail loud if Redis is unreachable at boot — but never take HTTP down
    // (health/ready already reports redis; enqueue throws when offline).
    await this.connection.ping().catch((err) => {
      console.error('[queue] redis ping failed — jobs will fail until Redis is reachable:', err);
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const q of this.queues.values()) await q.close().catch(() => undefined);
    this.queues.clear();
    this.connection?.disconnect();
    this.connection = null;
  }

  /** Enqueue a durable job; returns the platform job id (JobRecord.bullJobId). */
  async enqueue(queue: QueueName, name: string, payload: Record<string, unknown>, opts: EnqueueOpts = {}): Promise<string> {
    const queueObj = this.queues.get(queue);
    if (!queueObj) throw new Error(`unknown queue: ${queue}`);
    const jobId = `${queue}_${randomUUID()}`;
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
    await queueObj.add(name, { ...payload, jobRecordId: rec.id }, { jobId, delay: opts.delayMs ?? 0 });
    return jobId;
  }

  /** Counts per queue (health/status surfaces). */
  async counts(): Promise<Record<string, { waiting: number; active: number; delayed: number; failed: number }>> {
    const out: Record<string, { waiting: number; active: number; delayed: number; failed: number }> = {};
    for (const [name, q] of this.queues) {
      const [waiting, active, delayed, failed] = await Promise.all([
        q.getWaitingCount(),
        q.getActiveCount(),
        q.getDelayedCount(),
        q.getFailedCount(),
      ]);
      out[name] = { waiting, active, delayed, failed };
    }
    return out;
  }
}

export const QUEUE_PROVIDER = 'ACA_QUEUE';
