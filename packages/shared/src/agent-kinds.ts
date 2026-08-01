/**
 * Agent kinds — the node vocabulary of the workflow engine (docs/Contracts.md C7).
 * Core kinds are enumerated here; plugins introduce "<slug>" kinds in their own
 * namespace via workflow nodes `plugin.<slug>`.
 */
export const AgentKinds = [
  'agent.trend-analyzer',
  'agent.idea-generator',
  'agent.script-writer',
  'agent.fact-checker',
  'agent.seo-optimizer',
  'agent.voice-generator',
  'agent.scene-planner',
  'agent.asset-collector',
  'agent.video-generator',
  'agent.subtitle-generator',
  'agent.thumbnail-generator',
  'agent.quality-checker',
  'agent.publisher',
  'agent.analytics-collector',
  'agent.ai-optimizer',
  // v2.1 optional registered node (not in the default template)
  'agent.localizer',
] as const;

export type AgentKind = (typeof AgentKinds)[number];

export const PLUGIN_NODE_PREFIX = 'plugin.' as const;
export const GATE_REVIEW_KIND = 'gate.review' as const;
export const GATE_CONDITION_KIND = 'gate.condition' as const;

export function isAgentKind(kind: string): kind is AgentKind {
  return (AgentKinds as readonly string[]).includes(kind);
}

export type ParsedNodeKind =
  | { type: 'agent'; kind: AgentKind }
  | { type: 'plugin'; pluginId: string }
  | { type: 'gate.review' }
  | { type: 'gate.condition' }
  | { type: 'unknown'; raw: string };

export function parseNodeKind(raw: string): ParsedNodeKind {
  if (isAgentKind(raw)) return { type: 'agent', kind: raw };
  if (raw === GATE_REVIEW_KIND) return { type: 'gate.review' };
  if (raw === GATE_CONDITION_KIND) return { type: 'gate.condition' };
  if (raw.startsWith(PLUGIN_NODE_PREFIX) && raw.length > PLUGIN_NODE_PREFIX.length)
    return { type: 'plugin', pluginId: raw.slice(PLUGIN_NODE_PREFIX.length) };
  return { type: 'unknown', raw };
}
