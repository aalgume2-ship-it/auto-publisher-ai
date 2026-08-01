import { describe, expect, it } from 'vitest';
import { EventEnvelopeSchema } from '@aca/shared';
import { buildEnvelope, buildEnvelopes, EventContractError } from '../src/envelope.js';

const V7 = '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55';
const NOW = new Date('2026-08-01T20:00:00.000Z');

const validPayload = {
  orgId: V7,
  runId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e56',
  videoId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e57',
  projectId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e58',
  workflowVersionId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e59',
  triggerSource: 'AUTOPILOT' as const,
  creditBudget: 120,
};

describe('envelope building (ADR-024 v1.1 semantics)', () => {
  it('mints a valid envelope with catalog-validated payload', () => {
    const env = buildEnvelope(
      {
        type: 'aca.pipeline.run.started',
        orgId: V7,
        aggregateType: 'PipelineRun',
        aggregateId: V7,
        payload: validPayload,
      },
      { producer: 'apps/api', id: V7, now: NOW },
    );
    expect(EventEnvelopeSchema.safeParse(env).success).toBe(true);
    expect(env.occurredAt).toBe('2026-08-01T20:00:00.000Z');
    expect(env.producer).toBe('apps/api');
    expect(env.correlationId).toBe(V7); // default = own id (chain root)
    expect(env.causationId).toBeNull();
    expect(env.metadata).toEqual({});
    expect(env.version).toBe(1);
  });

  it('propagates correlationId/causationId/traceId when provided (chain continuation)', () => {
    const env = buildEnvelope(
      {
        type: 'aca.pipeline.run.started',
        orgId: V7,
        aggregateType: 'PipelineRun',
        aggregateId: V7,
        payload: validPayload,
        correlationId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e60',
        causationId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e61',
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        producer: 'apps/worker',
        metadata: { replayOf: V7 },
      },
      { producer: 'apps/api', now: NOW },
    );
    expect(env.correlationId).toBe('0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e60');
    expect(env.causationId).toBe('0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e61');
    expect(env.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(env.producer).toBe('apps/worker'); // caller's identity wins over writer default
    expect(env.metadata).toEqual({ replayOf: V7 });
  });

  it('rejects unknown event types (UNKNOWN_EVENT)', () => {
    try {
      buildEnvelope(
        { type: 'aca.nope.nothing.here', orgId: V7, aggregateType: 'X', aggregateId: V7, payload: {} },
        { producer: 'apps/api', now: NOW },
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EventContractError);
      expect((err as EventContractError).code).toBe('UNKNOWN_EVENT');
    }
  });

  it('rejects catalog-violating payloads (BAD_PAYLOAD) — nothing enters the outbox', () => {
    try {
      buildEnvelope(
        {
          type: 'aca.pipeline.run.started',
          orgId: V7,
          aggregateType: 'PipelineRun',
          aggregateId: V7,
          payload: { ...validPayload, durationMs: -1, creditBudget: 'lots' },
        },
        { producer: 'apps/api', now: NOW },
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EventContractError);
      expect((err as EventContractError).code).toBe('BAD_PAYLOAD');
    }
  });

  it('batch build validates every input before returning (all-or-nothing)', () => {
    const inputs = [
      { type: 'aca.video.deleted', orgId: V7, aggregateType: 'Video', aggregateId: V7, payload: { orgId: V7, projectId: V7, videoId: V7 } },
      { type: 'aca.flags.changed', orgId: null, aggregateType: 'FeatureFlag', aggregateId: 'queue.priority-lanes', payload: { key: 'queue.priority-lanes', to: true, scope: 'GLOBAL' } },
    ];
    const out = buildEnvelopes(inputs, { producer: 'apps/api', now: NOW });
    expect(out).toHaveLength(2);
    expect(out[1]?.orgId).toBeNull(); // global event
  });
});
