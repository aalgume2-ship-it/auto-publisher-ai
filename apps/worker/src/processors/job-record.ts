/**
 * JobRecord guard + dead-letter helpers shared by every processor.
 *
 * Idempotency: a job whose JobRecord is already COMPLETED/FAILED/CANCELLED is
 * acknowledged without re-running (BullMQ jobIds are stable per enqueue).
 * Dead-letter: every final failure is appended to `aca:dlq:<queue>` (a Redis
 * list) with the full payload + failure reason for manual inspection — the
 * UI/API keeps JobRecord as its source of truth.
 */
import type { DbClient } from '@aca/database';
import type { Redis } from 'ioredis';
import type { Logger } from '@aca/logger';

export async function beginJob(
  prisma: DbClient,
  logger: Logger,
  jobId: string,
  queue: string,
  recordId?: string | null,
): Promise<{ skip: boolean; jobRecordId: string | null }> {
  const rec = recordId
    ? await prisma.jobRecord.findUnique({ where: { id: recordId } })
    : await prisma.jobRecord.findUnique({ where: { bullJobId: jobId } });
  if (!rec) {
    logger.warn({ queue, jobId, module: 'job-record' }, 'job.record.missing');
    return { skip: true, jobRecordId: null };
  }
  if (rec.status === 'COMPLETED' || rec.status === 'FAILED' || rec.status === 'CANCELLED') {
    logger.info({ queue, jobId, status: rec.status, module: 'job-record' }, 'job.record.idempotent-skip');
    return { skip: true, jobRecordId: rec.id };
  }
  await prisma.jobRecord.update({
    where: { id: rec.id },
    data: { status: 'ACTIVE', attemptsMade: { increment: 1 }, processedAt: new Date() },
  });
  return { skip: false, jobRecordId: rec.id };
}

export async function completeJob(prisma: DbClient, jobRecordId: string | null): Promise<void> {
  if (!jobRecordId) return;
  await prisma.jobRecord.update({ where: { id: jobRecordId }, data: { status: 'COMPLETED', finishedAt: new Date() } });
}

export async function failJob(prisma: DbClient, jobRecordId: string | null, message: string): Promise<void> {
  if (!jobRecordId) return;
  await prisma.jobRecord.update({
    where: { id: jobRecordId },
    data: { status: 'FAILED', failedReason: message.slice(0, 500), finishedAt: new Date() },
  });
}

/** Append a final failure to the dead-letter list (kept for manual replay). */
export async function deadLetter(
  redis: Redis,
  prefix: string,
  queue: string,
  jobId: string,
  name: string,
  payload: unknown,
  failedReason: string,
): Promise<void> {
  try {
    await redis.rpush(
      `${prefix}:dlq:${queue}`,
      JSON.stringify({ jobId, queue, name, payload, failedReason: failedReason.slice(0, 1000), failedAt: new Date().toISOString() }),
    );
    await redis.ltrim(`${prefix}:dlq:${queue}`, -1000, -1); // keep last 1000
  } catch (err) {
    // DLQ write must never crash the worker
    console.error('[dlq] write failed:', err);
  }
}
