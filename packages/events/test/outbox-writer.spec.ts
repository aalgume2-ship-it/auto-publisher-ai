import { describe, expect, it } from 'vitest';
import { EventEnvelopeSchema } from '@aca/shared';
import { envelopeToRow, OutboxWriter } from '../src/outbox-writer.js';

const V7 = '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55';

/** Recording tx double — verifies exactly what the writer would persist (unit seam). */
class RecordingTx {
  batches: Array<Array<Record<string, unknown>>> = [];
  outboxEvent = {
    createMany: async (args: { data: Array<Record<string, unknown>> }) => {
      this.batches.push(args.data);
      return { count: args.data.length };
    },
  };
}

describe('outbox writer', () => {
  it('persists FULL v1.1 envelopes inside the caller transaction', () => {
    const tx = new RecordingTx();
    const writer = new OutboxWriter({ producer: 'apps/api' });
    return writer
      .write(tx, [
        {
          type: 'aca.video.deleted',
          orgId: V7,
          aggregateType: 'Video',
          aggregateId: V7,
          payload: { orgId: V7, projectId: V7, videoId: V7, reason: 'user request' },
        },
      ])
      .then((envelopes) => {
        expect(envelopes).toHaveLength(1);
        expect(tx.batches).toHaveLength(1);
        const row = tx.batches[0]?.[0];
        expect(row?.type).toBe('aca.video.deleted');
        expect(row?.orgId).toBe(V7);
        const stored = EventEnvelopeSchema.parse(row?.payload);
        expect(stored.id).toBe(envelopes[0]?.id);
        expect(stored.producer).toBe('apps/api');
        expect(stored.correlationId).toBe(envelopes[0]?.id);
        expect(stored.payload).toMatchObject({ reason: 'user request' });
      });
  });

  it('empty batch is a no-op (no insert call)', async () => {
    const tx = new RecordingTx();
    const writer = new OutboxWriter({ producer: 'apps/api' });
    await writer.write(tx, []);
    expect(tx.batches).toHaveLength(0);
  });

  it('one invalid event aborts the whole write BEFORE insert', async () => {
    const tx = new RecordingTx();
    const writer = new OutboxWriter({ producer: 'apps/api' });
    await expect(
      writer.write(tx, [
        {
          type: 'aca.video.deleted',
          orgId: V7,
          aggregateType: 'Video',
          aggregateId: V7,
          payload: { orgId: V7, projectId: V7, videoId: V7 },
        },
        { type: 'aca.unknown.thing.happened', orgId: null, aggregateType: 'X', aggregateId: 'x', payload: {} },
      ]),
    ).rejects.toThrow(/UNKNOWN_EVENT/);
    expect(tx.batches).toHaveLength(0);
  });

  it('envelopeToRow maps typed columns + occurredAt as Date', () => {
    const writer = new OutboxWriter({ producer: 'apps/worker', now: new Date('2026-08-01T21:00:00Z') });
    return writer
      .write(new RecordingTx(), [
        {
          type: 'aca.flags.changed',
          orgId: null,
          aggregateType: 'FeatureFlag',
          aggregateId: 'marketplace',
          payload: { key: 'marketplace', to: false, scope: 'GLOBAL' },
        },
      ])
      .then((envelopes) => {
        const env = envelopes[0];
        expect(env).toBeDefined();
        if (env === undefined) return;
        const row = envelopeToRow(env);
        expect(row.id).toBe(env.id);
        expect(row.aggregateType).toBe('FeatureFlag');
        expect(row.orgId).toBeNull();
        expect(row.occurredAt).toBeInstanceOf(Date);
        expect((row.occurredAt as Date).toISOString()).toBe('2026-08-01T21:00:00.000Z');
        expect(row.version).toBe(1);
      });
  });
});
