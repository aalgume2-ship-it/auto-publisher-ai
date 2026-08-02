/**
 * Envelope construction — the single place where events are minted (ADR-024).
 * Applies the catalog (payload validation), v1.1 defaults (correlationId = id,
 * producer injection, metadata {}), and RFC3339 occurredAt. An event whose
 * payload violates the catalog NEVER enters the outbox.
 */
import {
  EventEnvelopeSchema,
  validateEventPayload,
  type EventEnvelope,
  type OutboxWriteInput,
} from '@aca/shared';
import { generateId } from '@aca/database';

export class EventContractError extends Error {
  constructor(
    public readonly eventType: string,
    public readonly code: 'UNKNOWN_EVENT' | 'BAD_PAYLOAD' | 'ENVELOPE_INVALID',
    public readonly issues: string[],
  ) {
    super(`event "${eventType}" rejected: ${code} — ${issues.join('; ')}`);
    this.name = 'EventContractError';
  }
}

export interface BuildOptions {
  /** Service identity (e.g. "apps/api") — injected per ADR-024 when the caller omits it. */
  producer: string;
  /** Test/clock seams (production leaves both undefined). */
  id?: string;
  now?: Date;
}

export function buildEnvelope(input: OutboxWriteInput, opts: BuildOptions): EventEnvelope {
  const check = validateEventPayload(input.type, input.payload);
  if (!check.ok) throw new EventContractError(input.type, check.code, check.issues);

  const id = opts.id ?? generateId();
  const occurredAt = (opts.now ?? new Date()).toISOString();
  const candidate = {
    id,
    type: input.type,
    version: 1,
    orgId: input.orgId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    occurredAt,
    traceId: input.traceId,
    correlationId: input.correlationId ?? id,
    causationId: input.causationId ?? null,
    producer: input.producer ?? opts.producer,
    metadata: input.metadata ?? {},
    payload: input.payload,
  };

  const parsed = EventEnvelopeSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new EventContractError(
      input.type,
      'ENVELOPE_INVALID',
      parsed.error.issues.map((i: { path: readonly (string | number)[]; message: string }) => `${i.path.join('.')}: ${i.message}`),
    );
  }
  // materialize the required payload key (z.unknown() parses it as optional-prop)
  return { ...parsed.data, payload: parsed.data.payload };
}

export function buildEnvelopes(inputs: readonly OutboxWriteInput[], opts: Omit<BuildOptions, 'id'>): EventEnvelope[] {
  return inputs.map((input) => buildEnvelope(input, opts));
}
