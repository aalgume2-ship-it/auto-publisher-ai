import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '@aca/shared';
import { buildDeadLetterRow, dlxMirrorStream, DLQ_ERROR_MAX_CHARS } from '../src/dlq.js';
import { extractProducerSpanContext } from '../src/tracing.js';
import { isUniqueViolation } from '../src/dedup.js';

const env: EventEnvelope = {
  id: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55',
  type: 'aca.pipeline.run.step_failed',
  version: 1,
  orgId: '8c9d0e1f-2a3b-4c5d-9e6f-7a8b9c0d1e2f',
  aggregateType: 'PipelineRun',
  aggregateId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55',
  occurredAt: '2026-08-01T20:00:00.000Z',
  correlationId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55',
  causationId: null,
  producer: 'apps/worker',
  metadata: {},
  payload: {},
};

describe('DLQ row building', () => {
  it('maps the full original envelope + failure history, truncating errors to 4k', () => {
    const row = buildDeadLetterRow({
      consumer: 'notifications',
      stream: 'events:pipeline',
      streamEntryId: '1722512345678-0',
      envelope: env,
      error: 'x'.repeat(DLQ_ERROR_MAX_CHARS + 500),
      attemptsTotal: 10,
      firstFailedAt: new Date('2026-08-01T20:00:00Z'),
      now: new Date('2026-08-01T20:05:00Z'),
    });
    expect(row.consumer).toBe('notifications');
    expect(row.eventId).toBe(env.id);
    expect(row.type).toBe('aca.pipeline.run.step_failed');
    expect(row.status).toBe('OPEN');
    expect((row.error as string).length).toBe(DLQ_ERROR_MAX_CHARS);
    expect((row.envelope as { id: string }).id).toBe(env.id);
    expect(row.attemptsTotal).toBe(10);
    expect((row.firstFailedAt as Date).toISOString()).toBe('2026-08-01T20:00:00.000Z');
    expect((row.lastFailedAt as Date).toISOString()).toBe('2026-08-01T20:05:00.000Z');
  });

  it('dlx mirror stream is derived per domain', () => {
    expect(dlxMirrorStream('events:publishing')).toBe('events:dlx:publishing');
    expect(dlxMirrorStream('events:pipeline')).toBe('events:dlx:pipeline');
  });
});

describe('unique-violation detection', () => {
  it('P2002 → duplicate; anything else → no', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation({ code: 2002 })).toBe(false);
  });
});

describe('traceparent extraction', () => {
  it('parses a valid metadata.traceparent (W3C)', () => {
    const sc = extractProducerSpanContext({
      ...env,
      metadata: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
    });
    expect(sc).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: 1,
      isRemote: true,
    });
  });

  it('rejects all-zero ids and malformed values', () => {
    expect(
      extractProducerSpanContext({
        ...env,
        metadata: { traceparent: '00-00000000000000000000000000000000-00f067aa0ba902b7-01' },
      }),
    ).toBeUndefined();
    expect(extractProducerSpanContext({ ...env, metadata: { traceparent: 'garbage' } })).toBeUndefined();
    expect(extractProducerSpanContext({ ...env, metadata: { traceparent: 42 } })).toBeUndefined();
    expect(extractProducerSpanContext(env)).toBeUndefined();
  });
});
