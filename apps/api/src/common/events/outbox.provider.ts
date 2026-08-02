/**
 * Outbox writer provider (ADR-024/025): producers NEVER publish directly —
 * services receive this token and write event rows inside their own
 * transaction via OutboxWriter.write(tx, inputs). Producer identity is fixed
 * at composition time ('apps/api').
 */
import { createOutboxWriter, type OutboxWriter } from '@aca/events';

export const OUTBOX_WRITER = 'OUTBOX_WRITER';

export const outboxWriterProvider = {
  provide: OUTBOX_WRITER,
  useFactory: (): OutboxWriter => createOutboxWriter('apps/api'),
};
