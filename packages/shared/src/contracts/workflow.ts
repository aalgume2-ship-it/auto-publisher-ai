/**
 * Frozen contract C7 — Workflow Definition ("aca.workflow/1") + pure validators.
 * Definitions are immutable once a version is published; runs pin versions.
 */
import { z } from 'zod';
import { AgentKinds, parseNodeKind, PLUGIN_NODE_PREFIX } from '../agent-kinds.js';

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

export const WorkflowNodeSchema = z.discriminatedUnion('kind', [
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
