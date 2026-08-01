/**
 * Durable Dead-Letter handling (ADR-024): truth lives in `dead_letter_events`
 * (PG). After the retry budget is exhausted, the original envelope + failure
 * history is persisted, the stream entry is XACKed away, metrics fire, and an
 * OPTIONAL mirror copy may be appended to `events:dlx:<domain>` purely as a
 * realtime notification surface — consumers must NEVER treat the stream as
 * DLQ truth.
 */
import type { DbClient, Prisma } from '@aca/database';
import { generateId } from '@aca/database';
import type { EventEnvelope } from '@aca/shared';

export const DLQ_ERROR_MAX_CHARS = 4096;

export interface DeadLetterRowInput {
  consumer: string;
  stream: string;
  streamEntryId: string;
  envelope: EventEnvelope;
  error: string;
  attemptsTotal: number;
  firstFailedAt: Date;
  now?: Date;
}

export function buildDeadLetterRow(input: DeadLetterRowInput): Prisma.DeadLetterEventUncheckedCreateInput {
  const now = input.now ?? new Date();
  const env = input.envelope;
  return {
    id: generateId(),
    consumer: input.consumer,
    eventId: env.id,
    stream: input.stream,
    streamEntryId: input.streamEntryId,
    type: env.type,
    version: env.version,
    orgId: env.orgId,
    envelope: env as unknown as Prisma.InputJsonValue,
    error: input.error.slice(0, DLQ_ERROR_MAX_CHARS),
    attemptsTotal: input.attemptsTotal,
    firstFailedAt: input.firstFailedAt,
    lastFailedAt: now,
    status: 'OPEN',
  };
}

/** Persists the DLQ row. Returns the dead_letter_events id. */
export async function writeDeadLetter(db: DbClient, input: DeadLetterRowInput): Promise<string> {
  const row = buildDeadLetterRow(input);
  const created = await db.deadLetterEvent.create({ data: row, select: { id: true } });
  return created.id;
}

/** Mirror envelope for the notification surface (never the truth). */
export function dlxMirrorStream(domainStream: string): string {
  return domainStream.replace(/^events:/, 'events:dlx:');
}
