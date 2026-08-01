/**
 * Frozen contract C1 — the machine-readable EVENT CATALOG (ADR-024).
 * Every event type in the platform is documented HERE with: version, producer,
 * consumers, zod payload schema, and a human description. `docs/Event-Catalog.md`
 * is CI-generated from this module — never edited by hand.
 *
 * Payload conventions (normative):
 *  - platform-owned ids are uuidv7 (UuidV7Schema); external refs are plain strings.
 *  - money is integer cents; bigint quantities (costMicros, followers) are
 *    decimal STRINGS in payloads (JSON cannot carry bigint safely).
 *  - timestamps are RFC3339 UTC; no PII beyond functional necessity.
 *  - payloads evolve ADDITIVELY only (optional fields); breaking change ⇒
 *    envelope `version: 2` dual-emitted per C1 change policy.
 */
import { z } from 'zod';
import { UuidSchema, UuidV7Schema } from './events.js';

/* ------------------------------------------------------------------ */
/* Canonical consumer fleet (ids used in `consumers` below)            */
/* ------------------------------------------------------------------ */

export const ConsumerIds = [
  'orchestrator', // workflow run executor (advances DAG on pipeline.* events)
  'autopilot', // schedules new runs from idea/automation signals
  'notifications', // user-facing fan-out (email/in-app)
  'ws-bridge', // realtime UI bridge
  'webhooks-out', // developer webhook delivery
  'audit', // audit mirroring (security-relevant events persisted to audit_log)
  'analytics-projections', // read-model projections for dashboards/optimizer input
  'memory-writer', // AI memory subsystem (ADR-016)
  'quota-guard', // plan/quota/credit watchers
  'search-indexer', // search read-model updates
  'billing-projection', // billing/invoice read-model
] as const;
export type ConsumerId = (typeof ConsumerIds)[number];

/* ------------------------------------------------------------------ */
/* Shared payload fragments                                            */
/* ------------------------------------------------------------------ */

const ts = z.string().datetime({ offset: false });
/** bigint-as-string for JSON safety (see conventions above). */
const bigintStr = z.string().regex(/^\d+$/, 'decimal string for bigint');

const platformId = z.string().min(1).max(32); // registry id (ADR-022)

/* ------------------------------------------------------------------ */
/* Payload schemas per event type (all version 1)                      */
/* ------------------------------------------------------------------ */

export const EventPayloadSchemas = {
  'aca.auth.user.registered': z.object({
    userId: UuidV7Schema,
    orgId: UuidV7Schema,
    role: z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']),
    locale: z.string().max(10).optional(),
  }),

  'aca.billing.checkout.completed': z.object({
    orgId: UuidV7Schema,
    planCode: z.string().max(32),
    periodEnd: ts,
    externalRef: z.string().max(256),
  }),
  'aca.billing.subscription.activated': z.object({
    orgId: UuidV7Schema,
    planCode: z.string().max(32),
    seats: z.number().int().positive(),
    externalRef: z.string().max(256),
  }),
  'aca.billing.subscription.canceled': z.object({
    orgId: UuidV7Schema,
    planCode: z.string().max(32),
    effectiveAt: ts.optional(),
    externalRef: z.string().max(256),
  }),
  'aca.billing.subscription.past_due': z.object({
    orgId: UuidV7Schema,
    planCode: z.string().max(32),
    externalRef: z.string().max(256),
  }),
  'aca.billing.invoice.paid': z.object({
    orgId: UuidV7Schema,
    invoiceId: UuidV7Schema,
    amountCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    externalRef: z.string().max(256),
  }),
  'aca.billing.invoice.failed': z.object({
    orgId: UuidV7Schema,
    invoiceId: UuidV7Schema,
    amountCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    externalRef: z.string().max(256),
  }),
  'aca.billing.credits.granted': z.object({
    orgId: UuidV7Schema,
    credits: z.number().int().positive(),
    balanceAfter: z.number().int().nonnegative(),
    reason: z.enum(['MONTHLY_GRANT', 'PURCHASE', 'ADJUSTMENT', 'REFUND']),
  }),
  'aca.billing.credits.depleted': z.object({
    orgId: UuidV7Schema,
    balanceAfter: z.literal(0),
  }),
  'aca.billing.credits.low': z.object({
    orgId: UuidV7Schema,
    balanceAfter: z.number().int().nonnegative(),
    thresholdPct: z.number().int().min(1).max(99),
  }),

  'aca.channel.connected': z.object({
    orgId: UuidV7Schema,
    channelId: UuidV7Schema,
    platform: platformId,
    platformChannelId: z.string().max(128),
    displayName: z.string().max(128).optional(),
  }),
  'aca.channel.disconnected': z.object({
    orgId: UuidV7Schema,
    channelId: UuidV7Schema,
    platform: platformId,
    reason: z.enum(['USER', 'TOKEN_REVOKED', 'ERROR']),
  }),
  'aca.channel.token_expired': z.object({
    orgId: UuidV7Schema,
    channelId: UuidV7Schema,
    platform: platformId,
  }),
  'aca.channel.health_changed': z.object({
    orgId: UuidV7Schema,
    channelId: UuidV7Schema,
    platform: platformId,
    from: z.enum(['HEALTHY', 'DEGRADED', 'DOWN']),
    to: z.enum(['HEALTHY', 'DEGRADED', 'DOWN']),
  }),

  'aca.project.created': z.object({
    orgId: UuidV7Schema,
    projectId: UuidV7Schema,
    name: z.string().max(128),
    language: z.string().max(10),
    targetPlatforms: z.array(platformId),
  }),
  'aca.project.automation.enabled': z.object({
    orgId: UuidV7Schema,
    projectId: UuidV7Schema,
    reviewMode: z.enum(['FULL_AUTO', 'REVIEW_SCRIPT', 'REVIEW_MEDIA', 'REVIEW_FINAL']),
    scheduleCron: z.string().max(64).optional(),
  }),
  'aca.project.automation.disabled': z.object({
    orgId: UuidV7Schema,
    projectId: UuidV7Schema,
    disabledById: UuidSchema.optional(),
  }),

  'aca.idea.generated': z.object({
    orgId: UuidV7Schema,
    projectId: UuidV7Schema,
    ideaIds: z.array(UuidV7Schema).min(1),
    runId: UuidV7Schema.optional(),
    source: z.enum(['TREND_SCAN', 'AUTOPILOT', 'MANUAL']),
  }),
  'aca.idea.approved': z.object({
    orgId: UuidV7Schema,
    projectId: UuidV7Schema,
    ideaIds: z.array(UuidV7Schema).min(1),
    approvedById: UuidSchema.optional(),
  }),

  'aca.video.created': z.object({
    orgId: UuidV7Schema,
    projectId: UuidV7Schema,
    videoId: UuidV7Schema,
    ideaId: UuidV7Schema.optional(),
    source: z.enum(['PIPELINE', 'UPLOAD', 'API']),
  }),
  'aca.video.generated': z.object({
    orgId: UuidV7Schema,
    projectId: UuidV7Schema,
    videoId: UuidV7Schema,
    runId: UuidV7Schema,
    durationMs: z.number().int().positive(),
    qualityScore: z.number().min(0).max(100).optional(),
  }),
  'aca.video.deleted': z.object({
    orgId: UuidV7Schema,
    projectId: UuidV7Schema,
    videoId: UuidV7Schema,
    deletedById: UuidSchema.optional(),
    reason: z.string().max(256).optional(),
  }),

  'aca.pipeline.run.started': z.object({
    orgId: UuidV7Schema,
    runId: UuidV7Schema,
    videoId: UuidV7Schema,
    projectId: UuidV7Schema,
    workflowVersionId: UuidV7Schema,
    triggerSource: z.enum(['MANUAL', 'AUTOPILOT', 'RETRY', 'API', 'OPTIMIZER', 'WORKFLOW']),
    creditBudget: z.number().int().positive().nullable(),
  }),
  'aca.pipeline.run.step_completed': z.object({
    orgId: UuidV7Schema,
    runId: UuidV7Schema,
    videoId: UuidV7Schema,
    nodeId: z.string().max(40),
    step: z.string().max(128),
    attempt: z.number().int().nonnegative(),
    costMicros: bigintStr.optional(),
    durationMs: z.number().int().nonnegative().optional(),
  }),
  'aca.pipeline.run.step_failed': z.object({
    orgId: UuidV7Schema,
    runId: UuidV7Schema,
    videoId: UuidV7Schema,
    nodeId: z.string().max(40),
    step: z.string().max(128),
    attempt: z.number().int().nonnegative(),
    error: z.string().max(1024),
    willRetry: z.boolean(),
  }),
  'aca.pipeline.run.awaiting_review': z.object({
    orgId: UuidV7Schema,
    runId: UuidV7Schema,
    videoId: UuidV7Schema,
    gateNodeId: z.string().max(40),
    artifact: z.string().max(32),
    timeoutHours: z.number().int().positive(),
  }),
  'aca.pipeline.run.review_approved': z.object({
    orgId: UuidV7Schema,
    runId: UuidV7Schema,
    videoId: UuidV7Schema,
    gateNodeId: z.string().max(40),
    decidedById: UuidSchema,
    note: z.string().max(1024).optional(),
  }),
  'aca.pipeline.run.review_rejected': z.object({
    orgId: UuidV7Schema,
    runId: UuidV7Schema,
    videoId: UuidV7Schema,
    gateNodeId: z.string().max(40),
    decidedById: UuidSchema,
    note: z.string().max(1024).optional(),
  }),
  'aca.pipeline.run.completed': z.object({
    orgId: UuidV7Schema,
    runId: UuidV7Schema,
    videoId: UuidV7Schema,
    creditsUsed: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  }),
  'aca.pipeline.run.failed': z.object({
    orgId: UuidV7Schema,
    runId: UuidV7Schema,
    videoId: UuidV7Schema,
    error: z.string().max(1024),
    atNodeId: z.string().max(40).optional(),
    creditsUsed: z.number().int().nonnegative(),
  }),
  'aca.pipeline.run.canceled': z.object({
    orgId: UuidV7Schema,
    runId: UuidV7Schema,
    videoId: UuidV7Schema,
    canceledById: UuidSchema.optional(),
    reason: z.string().max(256).optional(),
  }),

  'aca.publishing.task.scheduled': z.object({
    orgId: UuidV7Schema,
    taskId: UuidV7Schema,
    videoId: UuidV7Schema,
    channelId: UuidV7Schema,
    platform: platformId,
    scheduledAt: ts.nullable(),
  }),
  'aca.publishing.task.rescheduled': z.object({
    orgId: UuidV7Schema,
    taskId: UuidV7Schema,
    videoId: UuidV7Schema,
    channelId: UuidV7Schema,
    platform: platformId,
    from: ts.nullable(),
    to: ts,
  }),
  'aca.publishing.publish.started': z.object({
    orgId: UuidV7Schema,
    taskId: UuidV7Schema,
    videoId: UuidV7Schema,
    channelId: UuidV7Schema,
    platform: platformId,
    attempt: z.number().int().nonnegative(),
  }),
  'aca.publishing.publish.completed': z.object({
    orgId: UuidV7Schema,
    taskId: UuidV7Schema,
    videoId: UuidV7Schema,
    channelId: UuidV7Schema,
    platform: platformId,
    platformVideoId: z.string().max(128),
    platformUrl: z.string().url(),
    scheduled: z.boolean(),
  }),
  'aca.publishing.publish.failed': z.object({
    orgId: UuidV7Schema,
    taskId: UuidV7Schema,
    videoId: UuidV7Schema,
    channelId: UuidV7Schema,
    platform: platformId,
    attempt: z.number().int().nonnegative(),
    error: z.string().max(1024),
    willRetry: z.boolean(),
  }),

  'aca.analytics.video.metrics_updated': z.object({
    orgId: UuidV7Schema,
    videoId: UuidV7Schema,
    platform: platformId,
    window: z.enum(['1h', '24h', '7d', '28d']),
    metrics: z.object({
      views: z.number().int().nonnegative().optional(),
      likes: z.number().int().nonnegative().optional(),
      comments: z.number().int().nonnegative().optional(),
      shares: z.number().int().nonnegative().optional(),
      watchTimeMs: bigintStr.optional(),
      ctr: z.number().min(0).max(1).optional(),
    }),
  }),
  'aca.analytics.channel.metrics_updated': z.object({
    orgId: UuidV7Schema,
    channelId: UuidV7Schema,
    platform: platformId,
    window: z.enum(['24h', '7d', '28d']),
    followersTotal: bigintStr.optional(),
    followersGained: z.number().int().nonnegative().optional(),
  }),

  'aca.optimizer.report.completed': z.object({
    orgId: UuidV7Schema,
    projectId: UuidV7Schema,
    reportId: UuidV7Schema,
    windowDays: z.number().int().positive(),
    findings: z.number().int().nonnegative(),
    memoriesWritten: z.number().int().nonnegative(),
  }),
  'aca.optimizer.actions.applied': z.object({
    orgId: UuidV7Schema,
    projectId: UuidV7Schema,
    reportId: UuidV7Schema,
    actions: z.array(z.string().max(64)).min(1),
    appliedBy: z.enum(['OPTIMIZER_AUTO', 'USER']),
  }),

  'aca.memory.entry.created': z.object({
    orgId: UuidV7Schema,
    memoryId: UuidV7Schema,
    scope: z.enum(['CHANNEL', 'PROJECT', 'ORG']),
    subject: z.enum([
      'HOOK_STYLE', 'WRITING_STYLE', 'DURATION', 'POST_TIME', 'THUMBNAIL_STYLE',
      'TOPIC', 'MUSIC', 'VOICE', 'HASHTAG', 'FORMAT', 'FREQUENCY', 'AUDIENCE',
    ]),
    channelId: UuidV7Schema.optional(),
    projectId: UuidV7Schema.optional(),
    confidence: z.number().min(0).max(1),
  }),
  'aca.memory.entry.superseded': z.object({
    orgId: UuidV7Schema,
    memoryId: UuidV7Schema,
    supersededById: UuidV7Schema,
    subject: z.string().max(32),
  }),

  'aca.plugin.installed': z.object({
    orgId: UuidV7Schema,
    pluginId: UuidV7Schema,
    slug: z.string().max(64),
    version: z.string().max(32),
    installedById: UuidSchema.optional(),
  }),
  'aca.plugin.enabled': z.object({ orgId: UuidV7Schema, pluginId: UuidV7Schema, slug: z.string().max(64) }),
  'aca.plugin.disabled': z.object({ orgId: UuidV7Schema, pluginId: UuidV7Schema, slug: z.string().max(64) }),
  'aca.plugin.failed': z.object({
    orgId: UuidV7Schema.optional(),
    pluginId: UuidV7Schema,
    slug: z.string().max(64),
    operation: z.enum(['INSTALL', 'HEALTHCHECK', 'INVOKE']),
    error: z.string().max(1024),
  }),

  'aca.marketplace.listing.published': z.object({
    orgId: UuidV7Schema, // seller org
    listingId: UuidV7Schema,
    kind: z.enum(['TEMPLATE', 'VOICE', 'WORKFLOW', 'PLUGIN', 'AI_EMPLOYEE', 'PROMPT_PACK']),
    priceCents: z.number().int().nonnegative(),
  }),
  'aca.marketplace.purchase.completed': z.object({
    orgId: UuidV7Schema, // buyer org
    sellerOrgId: UuidV7Schema.nullable(),
    listingId: UuidV7Schema,
    purchaseId: UuidV7Schema,
    amountCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
  'aca.marketplace.install.completed': z.object({
    orgId: UuidV7Schema,
    listingId: UuidV7Schema,
    kind: z.enum(['TEMPLATE', 'VOICE', 'WORKFLOW', 'PLUGIN', 'AI_EMPLOYEE', 'PROMPT_PACK']),
    installedRefId: UuidV7Schema,
  }),

  'aca.workflow.published': z.object({
    orgId: UuidV7Schema.nullable(),
    workflowId: UuidV7Schema,
    versionId: UuidV7Schema,
    version: z.number().int().positive(),
    isTemplate: z.boolean(),
  }),
  'aca.workflow.deprecated': z.object({
    orgId: UuidV7Schema.nullable(),
    workflowId: UuidV7Schema,
    versionId: UuidV7Schema,
    version: z.number().int().positive(),
  }),

  'aca.ai_team.message.posted': z.object({
    orgId: UuidV7Schema,
    threadId: UuidV7Schema,
    messageId: UuidV7Schema,
    runId: UuidV7Schema.optional(),
    videoId: UuidV7Schema.optional(),
    projectId: UuidV7Schema.optional(),
    kind: z.enum(['BRIEF', 'HANDOFF', 'FEEDBACK', 'APPROVAL_REQUEST', 'REPORT', 'NOTE']),
    fromRole: z.string().max(32),
    toRole: z.string().max(32).nullable(),
  }),

  'aca.security.session.reuse_detected': z.object({
    userId: UuidV7Schema,
    sessionId: UuidV7Schema,
    revokedCount: z.number().int().positive(),
  }),
  'aca.security.sso.enforced': z.object({
    orgId: UuidV7Schema,
    domain: z.string().max(253),
    enforcedById: UuidSchema,
  }),
  'aca.security.membership.revoked': z.object({
    orgId: UuidV7Schema,
    memberId: UuidV7Schema,
    userId: UuidV7Schema,
    revokedById: UuidSchema,
    reason: z.string().max(256).optional(),
  }),

  'aca.system.quota.threshold': z.object({
    orgId: UuidV7Schema,
    quota: z.enum(['VIDEOS_MONTHLY', 'CHANNELS', 'PROJECTS', 'STORAGE_GB', 'TEAM_SEATS', 'AI_CREDITS']),
    used: z.number().nonnegative(),
    limit: z.number().nonnegative(),
    thresholdPct: z.number().int().min(1).max(100),
  }),

  'aca.webhook.endpoint.autodisabled': z.object({
    orgId: UuidV7Schema,
    endpointId: UuidV7Schema,
    consecutiveFailures: z.number().int().positive(),
    lastStatus: z.string().max(32),
  }),

  'aca.flags.changed': z.object({
    key: z.string().max(128),
    from: z.unknown().optional(),
    to: z.unknown(),
    scope: z.enum(['GLOBAL', 'ORG', 'PLAN', 'USER']),
    changedById: UuidSchema.optional(),
  }),
} as const;

export type EventPayload<T extends keyof typeof EventPayloadSchemas> = z.infer<
  (typeof EventPayloadSchemas)[T]
>;

/* ------------------------------------------------------------------ */
/* Catalog entries: producer / consumers / description (docs source)   */
/* ------------------------------------------------------------------ */

export interface EventCatalogEntry {
  readonly name: keyof typeof EventPayloadSchemas;
  /** Envelope version of this event type (1 during the freeze). */
  readonly version: 1;
  /** Emitting deployable (or fleet). */
  readonly producer: string;
  /** Consumer fleet ids subscribed by design (ConsumerIds). */
  readonly consumers: readonly string[];
  /** One-line description used in the generated catalog doc. */
  readonly description: string;
}

function entry(
  name: keyof typeof EventPayloadSchemas,
  producer: string,
  consumers: readonly string[],
  description: string,
): EventCatalogEntry {
  return { name, version: 1, producer, consumers, description };
}

const API = 'apps/api';
const WORKER = 'apps/worker';
const WF = 'apps/worker (workflow executor)';

/** The catalog. Order = declaration order in docs; keyed by type for lookup. */
export const EventCatalog: Readonly<Record<keyof typeof EventPayloadSchemas, EventCatalogEntry>> = {
  'aca.auth.user.registered': entry('aca.auth.user.registered', API, ['notifications', 'analytics-projections', 'audit'], 'Account created with its owning organization.'),

  'aca.billing.checkout.completed': entry('aca.billing.checkout.completed', API, ['billing-projection', 'notifications', 'analytics-projections'], 'Checkout finished; activates subscription at period start.'),
  'aca.billing.subscription.activated': entry('aca.billing.subscription.activated', API, ['billing-projection', 'quota-guard', 'notifications', 'analytics-projections'], 'Subscription active; plan limits and monthly credit grant apply.'),
  'aca.billing.subscription.canceled': entry('aca.billing.subscription.canceled', API, ['billing-projection', 'quota-guard', 'notifications'], 'Subscription canceled (effective now or at period end).'),
  'aca.billing.subscription.past_due': entry('aca.billing.subscription.past_due', API, ['billing-projection', 'quota-guard', 'notifications'], 'Payment failed; org enters dunning window.'),
  'aca.billing.invoice.paid': entry('aca.billing.invoice.paid', API, ['billing-projection', 'audit'], 'Invoice settled.'),
  'aca.billing.invoice.failed': entry('aca.billing.invoice.failed', API, ['billing-projection', 'notifications'], 'Invoice payment attempt failed.'),
  'aca.billing.credits.granted': entry('aca.billing.credits.granted', WORKER, ['notifications', 'analytics-projections'], 'Credits landed in the org ledger (grant/purchase/refund).'),
  'aca.billing.credits.depleted': entry('aca.billing.credits.depleted', WORKER, ['notifications', 'quota-guard', 'autopilot'], 'Ledger hit zero — runs block until top-up (never surprise bills).'),
  'aca.billing.credits.low': entry('aca.billing.credits.low', WORKER, ['notifications', 'autopilot'], 'Ledger crossed the configured low threshold (80%/95%).'),

  'aca.channel.connected': entry('aca.channel.connected', API, ['notifications', 'analytics-projections', 'autopilot'], 'OAuth channel connected and profile resolved.'),
  'aca.channel.disconnected': entry('aca.channel.disconnected', API, ['notifications', 'autopilot', 'analytics-projections'], 'Channel detached (user action or revoked token).'),
  'aca.channel.token_expired': entry('aca.channel.token_expired', WORKER, ['notifications', 'autopilot'], 'Stored token expired; refresh failed — reconnect nudge.'),
  'aca.channel.health_changed': entry('aca.channel.health_changed', WORKER, ['notifications', 'analytics-projections', 'autopilot'], 'Channel health transition from scheduled health probes.'),

  'aca.project.created': entry('aca.project.created', API, ['analytics-projections', 'search-indexer', 'ws-bridge'], 'Project shell created.'),
  'aca.project.automation.enabled': entry('aca.project.automation.enabled', API, ['autopilot', 'notifications', 'analytics-projections'], 'Autopilot armed for the project.'),
  'aca.project.automation.disabled': entry('aca.project.automation.disabled', API, ['autopilot', 'analytics-projections'], 'Autopilot disarmed; in-flight runs continue.'),

  'aca.idea.generated': entry('aca.idea.generated', WORKER, ['autopilot', 'notifications', 'ws-bridge', 'analytics-projections'], 'Idea batch produced by trend analysis.'),
  'aca.idea.approved': entry('aca.idea.approved', API, ['autopilot'], 'Idea(s) approved for production.'),

  'aca.video.created': entry('aca.video.created', API, ['analytics-projections', 'search-indexer', 'ws-bridge'], 'Video row exists (pipeline target or upload).'),
  'aca.video.generated': entry('aca.video.generated', WF, ['notifications', 'analytics-projections', 'ws-bridge', 'autopilot'], 'Render finished; media package ready.'),
  'aca.video.deleted': entry('aca.video.deleted', API, ['analytics-projections', 'search-indexer', 'audit'], 'Video soft-deleted per retention policy.'),

  'aca.pipeline.run.started': entry('aca.pipeline.run.started', WF, ['orchestrator', 'ws-bridge', 'notifications', 'analytics-projections'], 'Run began executing its pinned workflow version.'),
  'aca.pipeline.run.step_completed': entry('aca.pipeline.run.step_completed', WF, ['orchestrator', 'analytics-projections', 'ws-bridge'], 'One DAG node finished (metered).'),
  'aca.pipeline.run.step_failed': entry('aca.pipeline.run.step_failed', WF, ['orchestrator', 'notifications', 'analytics-projections'], 'Node failed; willRetry reflects backoff budget.'),
  'aca.pipeline.run.awaiting_review': entry('aca.pipeline.run.awaiting_review', WF, ['notifications', 'ws-bridge', 'analytics-projections'], 'Review gate reached; run halts for a human decision.'),
  'aca.pipeline.run.review_approved': entry('aca.pipeline.run.review_approved', API, ['orchestrator', 'ws-bridge', 'analytics-projections'], 'Human approved the gate; run resumes.'),
  'aca.pipeline.run.review_rejected': entry('aca.pipeline.run.review_rejected', API, ['orchestrator', 'notifications', 'analytics-projections'], 'Human rejected; loopback or abort per workflow.'),
  'aca.pipeline.run.completed': entry('aca.pipeline.run.completed', WF, ['notifications', 'analytics-projections', 'webhooks-out', 'autopilot'], 'All nodes done; video ready for scheduling.'),
  'aca.pipeline.run.failed': entry('aca.pipeline.run.failed', WF, ['notifications', 'analytics-projections', 'webhooks-out'], 'Run aborted (budget, unrecoverable step, or guardrail).'),
  'aca.pipeline.run.canceled': entry('aca.pipeline.run.canceled', API, ['orchestrator', 'analytics-projections'], 'Run canceled by user or gate timeout policy.'),

  'aca.publishing.task.scheduled': entry('aca.publishing.task.scheduled', WF, ['notifications', 'analytics-projections', 'ws-bridge'], 'Publish task queued for a channel/slot.'),
  'aca.publishing.task.rescheduled': entry('aca.publishing.task.rescheduled', API, ['notifications', 'analytics-projections'], 'Task moved to a new slot.'),
  'aca.publishing.publish.started': entry('aca.publishing.publish.started', WORKER, ['analytics-projections', 'ws-bridge'], 'Upload to the platform began.'),
  'aca.publishing.publish.completed': entry('aca.publishing.publish.completed', WORKER, ['notifications', 'analytics-projections', 'webhooks-out', 'memory-writer', 'autopilot'], 'Video live (or scheduled) on the platform — the north-star event.'),
  'aca.publishing.publish.failed': entry('aca.publishing.publish.failed', WORKER, ['notifications', 'analytics-projections', 'webhooks-out'], 'Upload failed within retry budget.'),

  'aca.analytics.video.metrics_updated': entry('aca.analytics.video.metrics_updated', WORKER, ['analytics-projections', 'memory-writer'], 'Fresh per-video platform metrics ingested.'),
  'aca.analytics.channel.metrics_updated': entry('aca.analytics.channel.metrics_updated', WORKER, ['analytics-projections', 'memory-writer'], 'Fresh per-channel platform metrics ingested.'),

  'aca.optimizer.report.completed': entry('aca.optimizer.report.completed', WORKER, ['notifications', 'analytics-projections'], 'Optimization report produced for a project window.'),
  'aca.optimizer.actions.applied': entry('aca.optimizer.actions.applied', WORKER, ['audit', 'analytics-projections', 'memory-writer'], 'Approved optimizer actions applied (auto or user-driven).'),

  'aca.memory.entry.created': entry('aca.memory.entry.created', WORKER, ['analytics-projections', 'ws-bridge'], 'Durable memory fact added to the channel/project/org scope.'),
  'aca.memory.entry.superseded': entry('aca.memory.entry.superseded', WORKER, ['analytics-projections'], 'A memory truth was replaced by newer evidence.'),

  'aca.plugin.installed': entry('aca.plugin.installed', API, ['audit', 'ws-bridge'], 'Plugin installed into the org (config pending).'),
  'aca.plugin.enabled': entry('aca.plugin.enabled', API, ['audit', 'orchestrator'], 'Plugin enabled after config validation + healthcheck.'),
  'aca.plugin.disabled': entry('aca.plugin.disabled', API, ['audit', 'orchestrator'], 'Plugin disabled; router excludes it.'),
  'aca.plugin.failed': entry('aca.plugin.failed', WORKER, ['notifications', 'audit'], 'Plugin operation failed (install/health/invoke).'),

  'aca.marketplace.listing.published': entry('aca.marketplace.listing.published', API, ['search-indexer', 'analytics-projections'], 'Seller listing published to the marketplace.'),
  'aca.marketplace.purchase.completed': entry('aca.marketplace.purchase.completed', API, ['billing-projection', 'notifications', 'analytics-projections'], 'Purchase settled (revenue split booked).'),
  'aca.marketplace.install.completed': entry('aca.marketplace.install.completed', WORKER, ['notifications', 'analytics-projections'], 'Artifact materialized into the buyer org.'),

  'aca.workflow.published': entry('aca.workflow.published', API, ['orchestrator', 'search-indexer', 'audit'], 'Workflow version published (immutable from now on).'),
  'aca.workflow.deprecated': entry('aca.workflow.deprecated', API, ['orchestrator', 'audit'], 'Workflow version deprecated for new runs.'),

  'aca.ai_team.message.posted': entry('aca.ai_team.message.posted', WORKER, ['ws-bridge', 'notifications'], 'Crew message on the run/project thread (ADR-017).'),

  'aca.security.session.reuse_detected': entry('aca.security.session.reuse_detected', API, ['audit', 'notifications'], 'Refresh-token reuse detected; session family revoked.'),
  'aca.security.sso.enforced': entry('aca.security.sso.enforced', API, ['audit', 'notifications'], 'SSO enforcement switched on for a domain.'),
  'aca.security.membership.revoked': entry('aca.security.membership.revoked', API, ['audit', 'notifications'], 'Org membership revoked.'),

  'aca.system.quota.threshold': entry('aca.system.quota.threshold', WORKER, ['notifications', 'analytics-projections'], 'A plan quota crossed a configured threshold.'),
  'aca.webhook.endpoint.autodisabled': entry('aca.webhook.endpoint.autodisabled', WORKER, ['notifications', 'audit'], 'Endpoint auto-disabled after consecutive delivery failures.'),
  'aca.flags.changed': entry('aca.flags.changed', API, ['audit', 'analytics-projections'], 'Feature flag or override changed (global/org/plan/user scope).'),
};

/* ------------------------------------------------------------------ */
/* Catalog API                                                         */
/* ------------------------------------------------------------------ */

export function catalogEntryFor(type: string): EventCatalogEntry | undefined {
  return (EventCatalog as Record<string, EventCatalogEntry>)[type];
}

export function payloadSchemaFor(type: string): z.ZodTypeAny | undefined {
  return (EventPayloadSchemas as Record<string, z.ZodTypeAny>)[type];
}

/** Validates a payload against the catalog. Unknown type ⇒ issue with code UNKNOWN_EVENT. */
export function validateEventPayload(
  type: string,
  payload: unknown,
): { ok: true } | { ok: false; code: 'UNKNOWN_EVENT' | 'BAD_PAYLOAD'; issues: string[] } {
  const schema = payloadSchemaFor(type);
  if (!schema) return { ok: false, code: 'UNKNOWN_EVENT', issues: [`no catalog entry for "${type}"`] };
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'BAD_PAYLOAD',
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
  return { ok: true };
}

/** Producers validate at outbox-write; consumers MAY validate at the edge for poisoning isolation. */
export function assertCatalogComplete(eventNames: readonly string[]): string[] {
  const missing = eventNames.filter((n) => catalogEntryFor(n) === undefined);
  const extra = Object.keys(EventCatalog).filter((n) => !eventNames.includes(n));
  return [...missing.map((m) => `missing catalog entry: ${m}`), ...extra.map((x) => `catalog entry without EventNames row: ${x}`)];
}
