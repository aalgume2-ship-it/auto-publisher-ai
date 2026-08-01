/**
 * Frozen contract C7 — Workflow Definition ("aca.workflow/1") + pure validators.
 * Definitions are immutable once a version is published; runs pin versions.
 */
import { z } from 'zod';
import { AgentKinds, parseNodeKind, PLUGIN_NODE_PREFIX } from '../agent-kinds.js';
import { UuidSchema } from './events.js';
import type { Usage } from './ai-providers.js';
import type { CapabilityKind } from './plugin-manifest.js';
import type { IStoragePort } from './storage-port.js';

export const WORKFLOW_SCHEMA_ID = 'aca.workflow/1' as const;
export const WORKFLOW_MAX_NODES = 24;
export const WORKFLOW_MAX_LOOPBACKS_PER_PAIR = 2;

export const RoutingObjectiveSchema = z.enum([
  'QUALITY_FIRST',
  'BALANCED',
  'CHEAPEST',
  'FASTEST',
  'PINNED',
]);
export type RoutingObjective = z.infer<typeof RoutingObjectiveSchema>;

const nodeBase = {
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,39}$/)
    .describe('kebab-case node id, unique within the DAG'),
  needs: z.array(z.string()).default([]),
};

const AgentNodeSchema = z.object({
  ...nodeBase,
  kind: z.enum(AgentKinds),
  config: z.record(z.unknown()).optional(),
  routingObjective: RoutingObjectiveSchema.optional(),
  onFail: z.enum(['abort', 'continue', 'skip-dependents']).optional(),
});

const PluginNodeSchema = z.object({
  ...nodeBase,
  kind: z.string().startsWith(PLUGIN_NODE_PREFIX).min(PLUGIN_NODE_PREFIX.length + 1),
  capabilityUse: z.string().min(1),
  config: z.record(z.unknown()).optional(),
  onFail: z.enum(['abort', 'continue', 'skip-dependents']).optional(),
});

const GateReviewNodeSchema = z.object({
  ...nodeBase,
  kind: z.literal('gate.review'),
  config: z.object({
    artifact: z.string().min(1),
    timeoutHours: z.number().int().positive().max(24 * 30),
    onTimeout: z.enum(['HOLD', 'AUTO_APPROVE', 'CANCEL']),
  }),
});

const GateConditionNodeSchema = z.object({
  ...nodeBase,
  kind: z.literal('gate.condition'),
  config: z.object({
    when: z.record(z.unknown()), // JSON-Logic expression
    thenInclude: z.array(z.string()).min(1), // node ids to keep; others pruned (SKIPPED)
  }),
});

/**
 * NOTE: a plain union, NOT z.discriminatedUnion — the plugin node kind
 * (`plugin.<slug>`, an open string grammar) cannot yield the discrete literal
 * values a discriminator requires; zod threw at module load. Parse order is
 * safe: agent kinds are a closed enum, gate kinds are literals, plugin kinds
 * are prefix-guarded, so exactly one branch can match any valid input.
 */
export const WorkflowNodeSchema = z.union([
  AgentNodeSchema,
  PluginNodeSchema,
  GateReviewNodeSchema,
  GateConditionNodeSchema,
]);
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowDefinitionSchema = z
  .object({
    schema: z.literal(WORKFLOW_SCHEMA_ID),
    trigger: z.object({
      kind: z.enum(['manual', 'autopilot', 'api', 'event']),
      inputs: z.record(z.object({ type: z.enum(['string', 'number', 'boolean', 'json']), required: z.boolean().default(false) })).default({}),
      event: z.string().optional(), // required when kind === 'event'
    }),
    nodes: z.array(WorkflowNodeSchema).min(1).max(WORKFLOW_MAX_NODES),
    loopbacks: z
      .array(
        z.object({
          from: z.string().min(1),
          to: z.string().min(1),
          max: z.number().int().min(1).max(WORKFLOW_MAX_LOOPBACKS_PER_PAIR),
        }),
      )
      .max(4)
      .default([]),
    defaults: z.object({
      routingObjective: RoutingObjectiveSchema,
      creditBudget: z.number().int().positive(),
      language: z.string().optional(),
      timezone: z.string().optional(),
    }),
  })
  .superRefine((def, ctx) => {
    const ids = new Set<string>();
    for (const node of def.nodes) {
      if (ids.has(node.id)) ctx.addIssue({ code: 'custom', message: `duplicate node id "${node.id}"`, path: ['nodes'] });
      ids.add(node.id);
    }
    for (const node of def.nodes)
      for (const dep of node.needs)
        if (!ids.has(dep)) ctx.addIssue({ code: 'custom', message: `node "${node.id}" needs unknown node "${dep}"`, path: ['nodes'] });
    if (def.trigger.kind === 'event' && !def.trigger.event)
      ctx.addIssue({ code: 'custom', message: 'event trigger requires trigger.event', path: ['trigger'] });
  });
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

// ── Pure graph utilities (used by validator + executor + builder UI) ──

export interface WorkflowValidationIssue {
  code: 'CYCLE' | 'UNREACHABLE' | 'UNKNOWN_DEP' | 'TOO_MANY_NODES' | 'GATE_NO_SUCCESSOR';
  message: string;
  nodeId?: string;
}

/** Kahn's algorithm. Returns deterministic topological order. */
export function topologicalOrder(def: WorkflowDefinition): string[] {
  const indegree = new Map<string, number>(def.nodes.map((n) => [n.id, 0]));
  for (const n of def.nodes) for (const dep of n.needs) indegree.set(n.id, (indegree.get(n.id) ?? 0) + 1);
  const byId = new Map(def.nodes.map((n) => [n.id, n]));
  const queue = def.nodes.filter((n) => n.needs.length === 0).map((n) => n.id).sort();
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const n of def.nodes)
      if (n.needs.includes(id)) {
        const left = (indegree.get(n.id) ?? 1) - 1;
        indegree.set(n.id, left);
        if (left === 0) queue.push(n.id);
      }
  }
  if (order.length !== def.nodes.length) throw new Error('WorkflowValidationError: cycle detected');
  for (const id of order) void byId.get(id);
  return order;
}

export function validateWorkflow(def: WorkflowDefinition): { valid: boolean; issues: WorkflowValidationIssue[] } {
  const parsed = WorkflowDefinitionSchema.safeParse(def);
  const issues: WorkflowValidationIssue[] = [];
  if (!parsed.success) {
    for (const i of parsed.error.issues)
      issues.push({ code: i.message.includes('cycle') ? 'CYCLE' : 'UNKNOWN_DEP', message: i.message });
    return { valid: false, issues };
  }
  try {
    topologicalOrder(def);
  } catch {
    issues.push({ code: 'CYCLE', message: 'definition contains a dependency cycle' });
  }
  const gated = new Set(def.nodes.filter((n) => parseNodeKind(n.kind).type.startsWith('gate')).map((n) => n.id));
  for (const g of gated) {
    const hasSuccessor = def.nodes.some((n) => n.needs.includes(g));
    if (!hasSuccessor) issues.push({ code: 'GATE_NO_SUCCESSOR', message: `gate "${g}" has no dependent node — run would halt`, nodeId: g });
  }
  return { valid: issues.length === 0, issues };
}

/* ══════════════════════════════════════════════════════════════════ */
/* C7 · Agent Contract (frozen surface — additions are optional-only)  */
/* ══════════════════════════════════════════════════════════════════ */

/**
 * Enum mirrors of the Prisma enums they serialize into (kept as zod string
 * unions — @aca/shared must not import the database client). Drift-check:
 * CI asserts parity with packages/database/prisma/schema.prisma.
 */
export const MemorySubjectSchema = z.enum([
  'HOOK_STYLE',
  'WRITING_STYLE',
  'DURATION',
  'POST_TIME',
  'THUMBNAIL_STYLE',
  'TOPIC',
  'MUSIC',
  'VOICE',
  'HASHTAG',
  'FORMAT',
  'FREQUENCY',
  'AUDIENCE',
]);
export type MemorySubject = z.infer<typeof MemorySubjectSchema>;

export const EmployeeRoleSchema = z.enum([
  'CONTENT_MANAGER',
  'RESEARCHER',
  'SCRIPT_WRITER',
  'SEO_EXPERT',
  'THUMBNAIL_DESIGNER',
  'VOICE_DIRECTOR',
  'VIDEO_EDITOR',
  'PUBLISHER',
  'ANALYST',
  'GROWTH_MANAGER',
]);
export type EmployeeRole = z.infer<typeof EmployeeRoleSchema>;

export const TeamMessageKindSchema = z.enum([
  'BRIEF',
  'HANDOFF',
  'FEEDBACK',
  'APPROVAL_REQUEST',
  'REPORT',
  'NOTE',
]);
export type TeamMessageKind = z.infer<typeof TeamMessageKindSchema>;

/* ---- memory (AI-Pipeline §4/§7) ---- */

export const MemoryFactSchema = z.object({
  memoryId: UuidSchema,
  subject: MemorySubjectSchema,
  content: z.string().min(1).max(2_000),
  structured: z.unknown().optional(),
  confidence: z.number().min(0).max(1),
});
export type MemoryFact = z.infer<typeof MemoryFactSchema>;

export interface IMemoryContext {
  /**
   * channel → project → org scope merge, subject-filtered per agent.
   * Defaults: topK = 8, tokenBudget ≈ 400. The MemoryService records the
   * returned memoryIds on the step row (explainability citations).
   */
  compose(req: {
    channelId?: string;
    projectId: string;
    subjects: MemorySubject[];
    topK?: number;
    tokenBudget?: number;
  }): Promise<MemoryFact[]>;
}

/* ---- AI team channel (ADR-017) ---- */

export interface ITeamChannel {
  /** Posts a durable crew message on the run thread (`undefined` toRole = thread broadcast). */
  say(msg: {
    kind: TeamMessageKind;
    toRole?: EmployeeRole;
    content: string;
    structured?: unknown;
  }): Promise<{ messageId: string }>;
}

/* ---- credit ledger (hold → settle-actual → release remainder) ---- */

export interface ICreditLedger {
  /**
   * Hold estimated credits before a billable unit. Idempotent on `unitKey`
   * (executor uses `${stepRunId}:${attempt}`). Throws `CREDIT_INSUFFICIENT`
   * ProblemDetails when the org balance cannot cover the hold.
   */
  reserve(req: { unitKey: string; credits: number; note?: string }): Promise<{ reservationId: string }>;
  /** Settle a hold at actual cost — releases the unused remainder. */
  settle(req: { reservationId: string; actualCredits: number; usage?: Usage }): Promise<void>;
  /** Release a hold in full — skipped/canceled units, or failure before any billable call. */
  release(reservationId: string): Promise<void>;
}

/* ---- provider routing (no direct provider construction in agents) ---- */

export interface ICapabilityRouter {
  /**
   * Resolve + instantiate the adapter for a capability. Policy order:
   * explicit `objective` → run.routingObjective → node routing override.
   * The router never routes below the agent's `qualityFloor` (falls back
   * upward, costlier — never downward). Cast the result at the boundary
   * to the capability's port type (`route<ILLMProvider>('llm.chat')`).
   */
  route<TPort = unknown>(capability: CapabilityKind, objective?: RoutingObjective): Promise<TPort>;
}

/* ---- tracing ---- */

export type TraceAttrs = Record<string, string | number | boolean | undefined>;

export interface ITracePort {
  /** Runs `fn` inside a child span of the current step span (OTel). */
  withSpan<T>(name: string, attrs: TraceAttrs, fn: () => Promise<T>): Promise<T>;
  /** Annotates the current span (e.g. provider/model chosen, cache hit). */
  addEvent(name: string, attrs?: TraceAttrs): void;
}

/* ---- run / node references ---- */

export interface AgentRunRef {
  runId: string;
  videoId: string;
  projectId: string;
  workflowVersionId: string;
  creditBudget: number | null;
  creditsUsed: number;
  /** Content Manager BRIEF snapshot (opaque to most agents). */
  brief?: unknown;
}

export interface AgentNodeRef {
  /** Position in the workflow DAG. */
  nodeId: string;
  /** Step kind as stored on pipeline_step_runs.step: "agent.*" core kind or "plugin.<slug>". */
  kind: string;
  /** Workflow node config merged over project stylePreset (config wins), validated pre-enqueue. */
  config: Record<string, unknown>;
  /** 0-based retry counter (mirrors pipeline_step_runs.attempt). */
  attempt: number;
  stepRunId: string;
}

/* ---- the frozen context surface ---- */

export interface AgentContext<TDb = unknown> {
  readonly run: AgentRunRef;
  readonly node: AgentNodeRef;
  readonly orgId: string;
  /**
   * Tenant-scoped data-plane handle. Opaque at contract level
   * (`@aca/shared` must not import the database client); workers instantiate
   * `AgentContext<TenantDb>` from `@aca/database` and agents downcast.
   */
  readonly db: TDb;
  readonly storage: IStoragePort;
  readonly providers: ICapabilityRouter;
  readonly ledger: ICreditLedger;
  readonly memory: IMemoryContext;
  readonly team: ITeamChannel;
  readonly trace: ITracePort;
  /**
   * Transient progress signal (0..1) bridged to WS/events — call on
   * meaningful milestones only; it is not durability.
   */
  emitProgress(pct: number, note?: string): void;
  /** Cooperative cancellation — agents must honor within their iteration loops. */
  readonly signal: AbortSignal;
}

/**
 * Every pipeline unit of work. Input/output are zod-validated by the
 * executor at the boundary (never inside the agent); idempotency by
 * content-hash; cost metering via `ctx.ledger`.
 */
export interface PipelineAgent<I, O> {
  /** "agent.script-writer" (core kind) or "plugin.<slug>" (plugin-provided). */
  readonly kind: string;
  /** 0..1 — the router may never route this agent below this floor. */
  readonly qualityFloor: number;
  execute(ctx: AgentContext, input: I): Promise<O>;
}
