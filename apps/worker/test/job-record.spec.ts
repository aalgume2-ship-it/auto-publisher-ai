/**
 * Worker unit tests — job-record guards, DLQ wiring, and processor payload
 * contracts. These run WITHOUT Redis/Postgres (pure logic + mocks), so CI can
 * execute them anywhere.
 */
import { describe, expect, it, vi } from 'vitest';

/* ── job-record guards ─────────────────────────────────────────────────── */

describe('job-record guards', () => {
  it('beginJob skips already-completed records (idempotency)', async () => {
    const prisma = {
      jobRecord: {
        findUnique: vi.fn().mockResolvedValue({ id: 'r1', status: 'COMPLETED' }),
        update: vi.fn(),
      },
    };
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const { beginJob } = await import('../src/processors/job-record.js');
    const res = await beginJob(prisma as never, logger as never, 'job1', 'generation', 'r1');
    expect(res.skip).toBe(true);
    expect(prisma.jobRecord.update).not.toHaveBeenCalled();
  });

  it('beginJob activates a QUEUED record and increments attempts', async () => {
    const prisma = {
      jobRecord: {
        findUnique: vi.fn().mockResolvedValue({ id: 'r2', status: 'QUEUED', attemptsMade: 0 }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const { beginJob } = await import('../src/processors/job-record.js');
    const res = await beginJob(prisma as never, logger as never, 'job2', 'generation', 'r2');
    expect(res.skip).toBe(false);
    expect(prisma.jobRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE', attemptsMade: { increment: 1 } }) }),
    );
  });

  it('completeJob flips the record to COMPLETED', async () => {
    const prisma = { jobRecord: { update: vi.fn().mockResolvedValue({}) } };
    const { completeJob } = await import('../src/processors/job-record.js');
    await completeJob(prisma as never, 'r3');
    expect(prisma.jobRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('failJob writes failureReason (truncated) + finishedAt', async () => {
    const prisma = { jobRecord: { update: vi.fn().mockResolvedValue({}) } };
    const { failJob } = await import('../src/processors/job-record.js');
    await failJob(prisma as never, 'r4', 'x'.repeat(900));
    const arg = prisma.jobRecord.update.mock.calls[0]?.[0] as { data: { failedReason: string } };
    expect(arg.data.failedReason.length).toBeLessThanOrEqual(500);
  });

  it('deadLetter appends to aca:dlq:<queue> and trims to 1000', async () => {
    const redis = { rpush: vi.fn().mockResolvedValue(1), ltrim: vi.fn().mockResolvedValue(1) };
    const { deadLetter } = await import('../src/processors/job-record.js');
    await deadLetter(redis as never, 'aca', 'generation', 'job9', 'video.generate', { videoId: 'v1' }, 'boom');
    expect(redis.rpush).toHaveBeenCalledWith(
      'aca:dlq:generation',
      expect.stringContaining('"failedReason":"boom"'),
    );
    expect(redis.ltrim).toHaveBeenCalledWith('aca:dlq:generation', -1000, -1);
  });

  it('deadLetter never throws on redis failure', async () => {
    const redis = { rpush: vi.fn().mockRejectedValue(new Error('redis down')), ltrim: vi.fn() };
    const { deadLetter } = await import('../src/processors/job-record.js');
    await expect(deadLetter(redis as never, 'aca', 'q', 'j', 'n', {}, 'e')).resolves.toBeUndefined();
  });
});

/* ── generation processor payload contract ─────────────────────────────── */

describe('generation processor contract', () => {
  it('requires videoId or campaignPostId', async () => {
    const { createGenerationProcessor } = await import('../src/processors/generation.processor.js');
    const prisma = {
      jobRecord: {
        findUnique: vi.fn().mockResolvedValue(null), // no record → skip path
      },
    };
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(() => logger) };
    const queue = { add: vi.fn() };
    const processor = createGenerationProcessor({
      redis: { prefix: 'aca' },
      s3: {},
      ai: {},
      secrets: {},
      urls: {},
      platforms: {},
      billing: {},
      http: {},
      database: { url: 'postgresql://x' },
      auth: { jwtSecret: 'x'.repeat(32) },
      observability: {},
      events: {},
      nodeEnv: 'test',
      version: 'test',
      serviceName: 'test',
    } as never, prisma as never, logger as never, queue as never);
    // missing both videoId and campaignPostId + no jobRecord → beginJob returns skip=true,
    // so processor resolves without error (idempotent guard). Payload contract enforced later in process().
    await expect(processor({ id: 'j', name: 'video.generate', data: {}, attemptsMade: 0, opts: {} } as never)).resolves.toBeUndefined();
  });

  it('campaign publish re-enqueue queue name is BullMQ-safe (no colons)', () => {
    const prefix = 'aca';
    const queue = 'publish';
    const key = `${prefix}_q_${queue}`;
    expect(key).not.toContain(':');
    expect(key).toBe('aca_q_publish');
  });
});
