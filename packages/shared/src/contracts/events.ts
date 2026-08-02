/**
 * Frozen contract C1 — Event Envelope & Bus (docs/Contracts.md).
 * Producers: write outbox rows in the SAME transaction as domain state.
 * Consumers: inbox-dedup by (consumer, envelope.id) before side effects.
 */
import { z } from 'zod';

export const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const UuidSchema = z.string().uuid();
export const UuidV7Schema = z.string().regex(UUID_V7_REGEX, 'expected uuidv7');

export const EventEnvelopeSchema = z.object({
  id: UuidV7Schema,
  // Grammar: aca.<domain>.<verb-path> — verb parts are snake_case (step_completed,
  // past_due), depth 2..4 dotted segments after "aca". The catalog (not this
  // regex) is the normative type registry.
  type: z
    .string()
    .regex(
      /^aca\.[a-z0-9_-]+(\.[a-z0-9_-]+){1,3}$/,
      'event type must be aca.<domain>.<verb-path> (e.g. aca.video.created, aca.optimizer.report.completed)',
    ),
  version: z.literal(1),
  orgId: UuidSchema.nullable(),
  aggregateType: z.string().min(1).max(64),
  aggregateId: z.string().min(1).max(64),
  occurredAt: z.string().datetime({ offset: false }),
  traceId: z.string().optional(),
  /* ── ADR-024 (v1.1 additive) — the full causal chain ──
     correlationId: root of the chain; the outbox writer defaults it to envelope.id.
     causationId:   id of the event/command that DIRECTLY caused this one (null at chain start).
     producer:      service/agent identity, injected at outbox write time.
     metadata:      extensibility bag (replay markers, routing hints) — never business data. */
  correlationId: z.string().min(8).max(128).optional(),
  causationId: z.string().min(8).max(128).nullable().optional(),
  producer: z.string().min(1).max(128).optional(),
  metadata: z.record(z.unknown()).optional(),
  payload: z.unknown(),
});
export type EventEnvelope<T = unknown> = Omit<z.infer<typeof EventEnvelopeSchema>, 'payload'> & {
  payload: T;
};

/** Domain event names (initial catalog — append-only; breaking payload change ⇒ version 2 envelope). */
export const EventNames = [
  'aca.auth.user.registered',
  'aca.billing.checkout.completed',
  'aca.billing.subscription.activated',
  'aca.billing.subscription.canceled',
  'aca.billing.subscription.past_due',
  'aca.billing.invoice.paid',
  'aca.billing.invoice.failed',
  'aca.billing.credits.granted',
  'aca.billing.credits.depleted',
  'aca.billing.credits.low',
  'aca.channel.connected',
  'aca.channel.disconnected',
  'aca.channel.token_expired',
  'aca.channel.health_changed',
  'aca.organization.created',
  'aca.organization.updated',
  'aca.organization.settings_updated',
  'aca.organization.billing_profile_updated',
  'aca.department.created',
  'aca.department.updated',
  'aca.department.deleted',
  'aca.team.created',
  'aca.team.updated',
  'aca.team.deleted',
  'aca.team.member_added',
  'aca.team.member_removed',
  'aca.brand.updated',
  'aca.brand.reset',
  'aca.domain.registered',
  'aca.domain.verified',
  'aca.domain.verification_failed',
  'aca.domain.deleted',
  'aca.project.created',
  'aca.project.automation.enabled',
  'aca.project.automation.disabled',
  'aca.idea.generated',
  'aca.idea.approved',
  'aca.video.created',
  'aca.video.generated',
  'aca.video.deleted',
  'aca.pipeline.run.started',
  'aca.pipeline.run.step_completed',
  'aca.pipeline.run.step_failed',
  'aca.pipeline.run.awaiting_review',
  'aca.pipeline.run.review_approved',
  'aca.pipeline.run.review_rejected',
  'aca.pipeline.run.completed',
  'aca.pipeline.run.failed',
  'aca.pipeline.run.canceled',
  'aca.publishing.task.scheduled',
  'aca.publishing.task.rescheduled',
  'aca.publishing.publish.started',
  'aca.publishing.publish.completed',
  'aca.publishing.publish.failed',
  'aca.analytics.video.metrics_updated',
  'aca.analytics.channel.metrics_updated',
  'aca.optimizer.report.completed',
  'aca.optimizer.actions.applied',
  'aca.memory.entry.created',
  'aca.memory.entry.superseded',
  'aca.plugin.installed',
  'aca.plugin.enabled',
  'aca.plugin.disabled',
  'aca.plugin.failed',
  'aca.marketplace.listing.published',
  'aca.marketplace.purchase.completed',
  'aca.marketplace.install.completed',
  'aca.workflow.published',
  'aca.workflow.deprecated',
  'aca.ai_team.message.posted',
  'aca.security.session.reuse_detected',
  'aca.security.sso.enforced',
  'aca.security.membership.revoked',
  'aca.system.quota.threshold',
  'aca.webhook.endpoint.autodisabled',
  'aca.flags.changed',
] as const;
export type EventName = (typeof EventNames)[number];

export function eventStreamForType(type: string): string {
  // events:<domain> — bus routes each aggregate by hash(id)%shardCount within the stream
  return `events:${type.split('.')[1]}`;
}

export interface SubscribeOptions {
  stream: string;
  /** consumer group == consumer identity for inbox dedup */
  group: string;
  /** optional shard router mirroring producer sharding (run-hash) */
  shardOf?: (env: EventEnvelope) => number;
  shardCount?: number;
}

export interface IEventBus {
  /** Low-level append — production callers use the outbox writer (same-tx). */
  appendToStream(stream: string, env: EventEnvelope): Promise<void>;
  subscribe(opts: SubscribeOptions, handler: (env: EventEnvelope) => Promise<void>): Promise<void>;
  ack(stream: string, group: string, streamEntryId: string, consumer: string): Promise<void>;
}

/** Outbox write descriptor consumed by the outbox writer (ADR-024 defaults applied there). */
export interface OutboxWriteInput {
  type: EventName | string;
  orgId: string | null;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  traceId?: string;
  correlationId?: string;
  causationId?: string | null;
  /** Service identity — the writer fills this from its config when omitted. */
  producer?: string;
  metadata?: Record<string, unknown>;
}
