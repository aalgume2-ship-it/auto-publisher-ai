/**
 * Transactional outbox writer (C1 rule: producers NEVER publish directly).
 *
 *   const created = await db.$transaction(async (tx) => {
 *     const run = await tx.pipelineRun.create({ data: … });
 *     await outbox.write(tx, [{ type: 'aca.pipeline.run.started', … }]);
 *     return run;
 *   });
 *
 * The event row lands in the SAME transaction as the domain state — either
 * both commit or neither does. `OutboxEvent.payload` stores the FULL v1.1
 * envelope JSON (payload nested inside); typed columns exist for indexing.
 */
import type { Prisma } from '@aca/database';
import type { EventEnvelope, OutboxWriteInput } from '@aca/shared';
import { buildEnvelopes, type BuildOptions } from './envelope.js';

/** Structural subset of Prisma.TransactionClient this writer needs. */
export interface OutboxTx {
  outboxEvent: {
    createMany(args: { data: Array<Record<string, unknown>> }): Promise<unknown>;
  };
}

export function envelopeToRow(env: EventEnvelope): Record<string, unknown> {
  return {
    id: env.id,
    orgId: env.orgId,
    aggregateType: env.aggregateType,
    aggregateId: env.aggregateId,
    type: env.type,
    version: env.version,
    // FULL envelope (v1.1 fields + payload) — the replay/DLQ truth format.
    payload: env as unknown as Prisma.InputJsonValue,
    traceId: env.traceId ?? null,
    occurredAt: new Date(env.occurredAt),
  };
}

export class OutboxWriter {
  constructor(private readonly identity: Omit<BuildOptions, 'id'>) {}

  /**
   * Validates + builds envelopes and inserts them inside `tx`.
   * Throws EventContractError BEFORE any insert when a single event violates
   * the catalog (all-or-nothing, matching tx semantics).
   */
  async write(tx: OutboxTx, inputs: readonly OutboxWriteInput[]): Promise<EventEnvelope[]> {
    if (inputs.length === 0) return [];
    const envelopes = buildEnvelopes(inputs, this.identity);
    await tx.outboxEvent.createMany({ data: envelopes.map(envelopeToRow) });
    return envelopes;
  }
}

/** Convenience factory — one writer per deployable, producer identity fixed at boot. */
export function createOutboxWriter(producer: string): OutboxWriter {
  return new OutboxWriter({ producer });
}
