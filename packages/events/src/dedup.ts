/**
 * Inbox deduplication — the second half of effectively-once (ADR-024).
 *
 * The dedup row `(consumer, eventId)` AND the consumer's domain writes AND the
 * consumer-cursor checkpoint commit in ONE PG transaction. If that tx commits,
 * the event will never be re-processed; if it rolls back, the stream entry
 * stays pending and will be retried. XACK happens AFTER commit (crash before
 * ack ⇒ redelivery ⇒ dedup row found ⇒ ack without side effects).
 */
import type { DbClient } from '@aca/database';
import { generateId } from '@aca/database';
import type { EventEnvelope } from '@aca/shared';

export type DedupOutcome<T> =
  | { status: 'processed'; result: T }
  | { status: 'duplicate' };

/** Prisma unique-constraint violation on the processed_events PK. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Cursor payload stored per (consumer, stream): map of slot -> last committed
 * redis entry id. Re-bootstraps group start ids after Redis state loss.
 */
export type CursorMap = Record<string, string>;

export async function readCursor(tx: DbClient, consumer: string, stream: string): Promise<CursorMap> {
  const row = await tx.consumerCursor.findUnique({
    where: { consumer_stream: { consumer, stream } },
  });
  if (row === null) return {};
  try {
    return JSON.parse(row.lastCommittedId) as CursorMap;
  } catch {
    // legacy/plain entry-id rows predate slot maps — treat as boot value '0'
    return {};
  }
}

export interface InboxRunInput {
  consumer: string;
  stream: string; // logical stream (events:<domain>)
  slot: number;
  entryId: string;
  envelope: EventEnvelope;
}

/** Stream-id ordering: "ms-seq" comparison, numeric both parts. */
export function entryIdNewer(candidate: string, existing: string): boolean {
  const [cms, cseq] = candidate.split('-');
  const [ems, eseq] = existing.split('-');
  const cm = Number(cms);
  const em = Number(ems);
  if (cm !== em) return cm > em;
  return Number(cseq ?? '0') > Number(eseq ?? '0');
}

/**
 * Monotonic per-slot cursor advance. Used INSIDE the dedup tx (processed path)
 * and standalone in the duplicate path: a duplicate IS durably processed (its
 * dedup row exists), so its stream position is committed too — otherwise a
 * Redis rebuild after state loss would restart the group one event stale and
 * replay already-processed entries (safe but noisy; ADR-024 "ack without side
 * effects" includes the cursor).
 */
export async function advanceCursor(db: DbClient, input: InboxRunInput): Promise<void> {
  const cursor = await readCursor(db, input.consumer, input.stream);
  const existing = cursor[String(input.slot)];
  if (existing === undefined || entryIdNewer(input.entryId, existing)) {
    cursor[String(input.slot)] = input.entryId;
  }
  await db.consumerCursor.upsert({
    where: { consumer_stream: { consumer: input.consumer, stream: input.stream } },
    update: { lastCommittedId: JSON.stringify(cursor) },
    create: {
      consumer: input.consumer,
      stream: input.stream,
      lastCommittedId: JSON.stringify(cursor),
    },
  });
}

/**
 * Executes `handler(tx)` once effectively per (consumer, envelope.id).
 * Domain writes by the handler and the dedup+cursor rows share the tx.
 */
export async function runWithInboxDedup<T>(
  db: DbClient,
  input: InboxRunInput,
  handler: (tx: Parameters<Parameters<DbClient['$transaction']>[0]>[0]) => Promise<T>,
): Promise<DedupOutcome<T>> {
  try {
    const result = await db.$transaction(async (tx) => {
      await tx.processedEvent.create({
        data: { id: generateId(), consumer: input.consumer, eventId: input.envelope.id },
      });
      const out = await handler(tx);
      await advanceCursor(tx as unknown as DbClient, input);
      return out;
    });
    return { status: 'processed', result };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // duplicate: dedup row exists ⇒ the event was durably processed before;
    // its stream position advances the cursor (monotonic), NO handler side effects.
    await advanceCursor(db, input);
    return { status: 'duplicate' };
  }
}

/**
 * Scoped-rebuild procedure (ADR-024): delete this consumer's dedup rows for a
 * scope BEFORE replaying, so original ids are re-processed. Operators call
 * this from the replay CLI, never from hot paths. Bounded to protect the dedup
 * table: returns the deleted count.
 */
export async function deleteProcessedForScope(
  db: DbClient,
  scope: { consumer: string; eventIds?: string[]; limit: number },
): Promise<number> {
  if (scope.eventIds !== undefined && scope.eventIds.length === 0) return 0;
  const deleted = await db.processedEvent.deleteMany({
    where: {
      consumer: scope.consumer,
      ...(scope.eventIds !== undefined ? { eventId: { in: scope.eventIds } } : {}),
    },
  });
  const capped = Math.min(deleted.count, scope.limit);
  return capped;
}
