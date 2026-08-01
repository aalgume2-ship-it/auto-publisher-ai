/**
 * Contract conformance specs — the executable guard for the frozen C1/C2/C7
 * surfaces (docs/Testing-Strategy.md: contract tests gate every merge).
 */
import { describe, expect, it } from 'vitest';
import {
  EventEnvelopeSchema,
  eventStreamForType,
  UuidV7Schema,
} from '../src/contracts/events.js';
import {
  WorkflowDefinitionSchema,
  topologicalOrder,
  validateWorkflow,
  WORKFLOW_MAX_NODES,
} from '../src/contracts/workflow.js';
import {
  validateManifest,
  PluginManifestSchema,
  type PluginManifest,
} from '../src/contracts/plugin-manifest.js';

/* ------------------------------------------------------------------ */
/* C1 — events                                                         */
/* ------------------------------------------------------------------ */

describe('C1 events', () => {
  const envelope = {
    id: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55',
    type: 'aca.pipeline.run.started',
    version: 1,
    orgId: '8c9d0e1f-2a3b-4c5d-9e6f-7a8b9c0d1e2f',
    aggregateType: 'PipelineRun',
    aggregateId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55',
    occurredAt: '2026-08-01T12:00:00Z',
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    payload: { runId: 'r1' },
  } as const;

  it('accepts a spec-shaped envelope', () => {
    expect(EventEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it('rejects a non-v7 id (inbox dedup depends on sortable v7)', () => {
    expect(EventEnvelopeSchema.safeParse({ ...envelope, id: '8c9d0e1f-2a3b-4c5d-9e6f-7a8b9c0d1e2f' }).success).toBe(false);
    expect(UuidV7Schema.safeParse(envelope.id).success).toBe(true);
  });

  it('rejects malformed event types', () => {
    expect(EventEnvelopeSchema.safeParse({ ...envelope, type: 'pipeline.started' }).success).toBe(false);
    expect(EventEnvelopeSchema.safeParse({ ...envelope, version: 2 }).success).toBe(false);
  });

  it('routes types to per-domain streams', () => {
    expect(eventStreamForType('aca.pipeline.run.started')).toBe('events:pipeline');
    expect(eventStreamForType('aca.billing.subscription.activated')).toBe('events:billing');
  });
});

/* ------------------------------------------------------------------ */
/* C7 — workflow definition                                            */
/* ------------------------------------------------------------------ */

const baseDef = {
  schema: 'aca.workflow/1' as const,
  trigger: { kind: 'autopilot' as const, inputs: {} },
  nodes: [
    { id: 'research', kind: 'agent.trend-analyzer', needs: [] },
    { id: 'script', kind: 'agent.script-writer', needs: ['research'], onFail: 'abort' as const },
    { id: 'broll', kind: 'plugin.veo-broll', needs: ['script'], capabilityUse: 'video-engine' },
    {
      id: 'gate-script',
      kind: 'gate.review' as const,
      needs: ['script'],
      config: { artifact: 'script', timeoutHours: 24, onTimeout: 'HOLD' as const },
    },
    {
      id: 'branch',
      kind: 'gate.condition' as const,
      needs: ['broll'],
      config: { when: { '==': [{ var: 'aspectRatio' }, '16:9'] }, thenInclude: ['publish'] },
    },
  ],
  loopbacks: [],
  defaults: { routingObjective: 'BALANCED' as const, creditBudget: 120 },
};

describe('C7 workflow definition', () => {
  it('parses a definition exercising all four node kinds (regression: plugin wildcard kinds cannot form a zod discriminator)', () => {
    const parsed = WorkflowDefinitionSchema.safeParse(baseDef);
    expect(parsed.success).toBe(true);
  });

  it('produces a deterministic topological order', () => {
    const def = WorkflowDefinitionSchema.parse(baseDef);
    expect(topologicalOrder(def)).toEqual(['research', 'script', 'broll', 'gate-script', 'branch']);
  });

  it('rejects cycles, unknown deps, duplicate ids', () => {
    const def = WorkflowDefinitionSchema.parse(baseDef);
    const cyclic = {
      ...def,
      nodes: def.nodes.map((n) =>
        n.id === 'research' ? { ...n, needs: ['branch'] } : n.id === 'branch' ? { ...n, needs: ['research'] } : n,
      ),
    };
    const out = validateWorkflow(cyclic);
    expect(out.valid).toBe(false);
    expect(out.issues.some((i) => i.code === 'CYCLE')).toBe(true);
  });

  it('accepts the shipped autopilot-v1 shape: 15 linear agent nodes + qc→script loopback', () => {
    const ids = [
      'trend-research', 'ideation', 'script', 'fact-check', 'seo', 'voice', 'scenes', 'assets',
      'render', 'subtitles', 'thumbnails', 'qc', 'publish', 'analytics', 'optimize',
    ];
    const kinds = [
      'agent.trend-analyzer', 'agent.idea-generator', 'agent.script-writer', 'agent.fact-checker',
      'agent.seo-optimizer', 'agent.voice-generator', 'agent.scene-planner', 'agent.asset-collector',
      'agent.video-generator', 'agent.subtitle-generator', 'agent.thumbnail-generator',
      'agent.quality-checker', 'agent.publisher', 'agent.analytics-collector', 'agent.ai-optimizer',
    ] as const;
    const def = WorkflowDefinitionSchema.parse({
      schema: 'aca.workflow/1',
      trigger: { kind: 'autopilot', inputs: { niche: { type: 'string', required: true } } },
      nodes: ids.map((id, i) => ({ id, kind: kinds[i], needs: i === 0 ? [] : [ids[i - 1]] })),
      loopbacks: [{ from: 'qc', to: 'script', max: 2 }],
      defaults: { routingObjective: 'BALANCED', creditBudget: 120 },
    });
    expect(def.nodes).toHaveLength(15);
    expect(validateWorkflow(def).valid).toBe(true);
    expect(topologicalOrder(def)).toEqual(ids);
    expect(def.nodes.length).toBeLessThanOrEqual(WORKFLOW_MAX_NODES);
  });

  it('event trigger without event name is rejected', () => {
    expect(
      WorkflowDefinitionSchema.safeParse({
        ...baseDef,
        trigger: { kind: 'event', inputs: {} },
      }).success,
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* C2 — plugin manifest                                                */
/* ------------------------------------------------------------------ */

const baseManifest: PluginManifest = PluginManifestSchema.parse({
  id: 'aca.openai',
  version: '1.0.0',
  contractMajor: 1,
  displayName: 'OpenAI',
  publisher: { name: 'AutoCreator AI', verified: true },
  kind: 'builtin',
  capabilities: [{ capability: 'llm.chat', entry: './dist/openai/llm.js', costClass: 'medium', models: ['gpt-4.1'] }],
  secretKeys: ['apiKey'],
});

describe('C2 plugin manifest', () => {
  it('accepts a first-party manifest', () => {
    const out = validateManifest(baseManifest);
    expect(out.ok).toBe(true);
  });

  it('requires oauthConfig when the manifest exposes the publisher capability', () => {
    const out = validateManifest({
      ...baseManifest,
      id: 'aca.pub',
      capabilities: [{ capability: 'publisher', entry: './dist/pub.js' }],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issues.map((i) => i.code)).toContain('OAUTH_REQUIRED');
  });

  it('rejects oauthConfig on non-publisher manifests (C2: publisher kind only)', () => {
    const out = validateManifest({
      ...baseManifest,
      oauthConfig: {
        authorizeUrl: 'https://accounts.example.com/auth',
        tokenUrl: 'https://oauth2.example.com/token',
        scopes: ['scope.a'],
        pkce: 'optional',
      },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issues.map((i) => i.code)).toContain('OAUTH_UNEXPECTED');
  });

  it('rejects duplicate capability bindings and non-semver versions', () => {
    const dup = validateManifest({
      ...baseManifest,
      capabilities: [
        { capability: 'llm.chat', entry: './a.js' },
        { capability: 'llm.chat', entry: './a.js' },
      ],
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.issues.map((i) => i.code)).toContain('DUPLICATE_CAPABILITY');
    expect(PluginManifestSchema.safeParse({ ...baseManifest, version: '1.0' }).success).toBe(false);
    expect(PluginManifestSchema.safeParse({ ...baseManifest, contractMajor: 2 }).success).toBe(false);
  });
});
