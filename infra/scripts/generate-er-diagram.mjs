#!/usr/bin/env node
/**
 * Generates docs/diagrams/database-er.md from packages/database/prisma/schema.prisma
 * (which itself is byte-identical to docs/Database.md §3 — CI-enforced).
 *
 *   node infra/scripts/generate-er-diagram.mjs          # write
 *   node infra/scripts/generate-er-diagram.mjs --check  # CI drift gate
 *
 * Emits an all-model overview (relations only) plus one attribute-level
 * erDiagram per domain. Domain assignment is an explicit table below; a model
 * missing from it is a hard error (new models must be added by the same PR).
 * Output is byte-deterministic (schema file order is preserved everywhere).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const schemaPath = join(root, 'packages', 'database', 'prisma', 'schema.prisma');
const outPath = join(root, 'docs', 'diagrams', 'database-er.md');
const checkMode = process.argv.includes('--check');

/* ── Domain assignment (must cover EVERY model exactly once) ─────────────── */
const DOMAINS = [
  ['identity-tenancy', 'Identity & Tenancy', [
    'User', 'OAuthIdentity', 'UserSession', 'Organization', 'OrganizationMember',
    'OrganizationInvitation', 'Team', 'TeamMember', 'CustomRole', 'OrganizationBrand', 'Department',
    'CustomDomain', 'SsoConnection', 'ScimToken', 'IpAllowListEntry',
  ]],
  ['billing-entitlements', 'Billing & Entitlements', [
    'Plan', 'Subscription', 'Invoice', 'AiCreditTransaction', 'UsageRecord', 'OrganizationBillingProfile',
  ]],
  ['channels-content', 'Channels, Content & Publishing', [
    'ProviderCredential', 'Channel', 'ChannelCredential', 'Project', 'AutomationConfig',
    'TrendSnapshot', 'Idea', 'Video', 'Script', 'Voiceover', 'Voice', 'Scene', 'Asset',
    'AssetBlob', 'AssetUsage', 'VideoRendition', 'SubtitleTrack', 'Thumbnail', 'PublishingTask',
  ]],
  ['pipeline-workflows', 'Pipeline & Workflow Engine', [
    'Workflow', 'WorkflowVersion', 'PipelineRun', 'PipelineStepRun', 'JobRecord',
  ]],
  ['events-reliability', 'Events Backbone & Reliability', [
    'OutboxEvent', 'ProcessedEvent', 'DeadLetterEvent', 'ConsumerCursor', 'IdempotencyRecord',
  ]],
  ['analytics-ai', 'Analytics, Memory & AI', [
    'ChannelAnalyticsDaily', 'VideoAnalyticsDaily', 'OptimizationReport', 'Experiment',
    'ExperimentVariant', 'MemoryEntry', 'AiEmployee', 'AiMessage',
  ]],
  ['marketplace-developer', 'Marketplace & Developer Platform', [
    'PluginRecord', 'PluginInstallation', 'MarketplaceListing', 'MarketplacePurchase',
    'MarketplaceReview', 'DeveloperApp', 'OauthAuthorizationCode', 'OauthGrant',
    'FeatureFlag', 'FeatureFlagOverride', 'ApiKey', 'WebhookEndpoint', 'WebhookDelivery',
    'ProcessedWebhookEvent',
  ]],
  ['audit-notifications', 'Audit & Notifications', [
    'AuditLog', 'Notification', 'NotificationPreference',
  ]],
];

/* ── Schema parsing ──────────────────────────────────────────────────────── */
const src = readFileSync(schemaPath, 'utf8');
const models = new Map(); // name -> { fields: [{name,type,isArray,isOptional,isId,isFk,relation?}] , order }
const modelOrder = [];

const modelRe = /^model (\w+) \{([\s\S]*?)^\}/gm;
let m;
while ((m = modelRe.exec(src)) !== null) {
  const [, name, body] = m;
  const fields = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('//') || line.startsWith('@@')) continue;
    const fm = /^(\w+)\s+([\w]+(\[\])?(\?)?|"[^"]*"(\?\[\])?)\s*(.*)$/.exec(line);
    if (!fm) continue;
    const fName = fm[1];
    let fType = fm[2];
    const isArray = fType.endsWith('[]');
    if (isArray) fType = fType.slice(0, -2);
    const isOptional = fType.endsWith('?');
    if (isOptional) fType = fType.slice(0, -1);
    const attrs = fm[6] ?? '';
    const relMatch = /@relation\((?:"([^"]+)",\s*)?(?:fields:\s*\[([^\]]*)\])?/.exec(attrs);
    fields.push({
      name: fName,
      type: fType,
      isArray,
      isOptional,
      isId: /@id\b/.test(attrs),
      isFk: /references:\s*\[/.test(attrs) ? false : undefined, // resolved below
      isScalarFk: false,
      relation: relMatch
        ? { name: relMatch[1] ?? null, fkFields: relMatch[2] ? relMatch[2].split(',').map((s) => s.trim()) : [] }
        : null,
    });
  }
  models.set(name, { fields });
  modelOrder.push(name);
}

// mark scalar FK fields (listed in some relation's fields:[...])
for (const { fields } of models.values()) {
  for (const f of fields) {
    if (f.relation && f.relation.fkFields.length > 0) {
      for (const fk of f.relation.fkFields) {
        const scalar = fields.find((x) => x.name === fk);
        if (scalar) scalar.isScalarFk = true;
      }
    }
  }
}

const seen = new Set(modelOrder);
const assigned = new Set(DOMAINS.flatMap(([, , list]) => list));
for (const name of modelOrder) {
  if (!assigned.has(name)) {
    console.error(`ER generator: model ${name} is not assigned to any domain — update DOMAINS in this script.`);
    process.exit(1);
  }
}
for (const name of assigned) {
  if (!seen.has(name)) {
    console.error(`ER generator: DOMAINS lists ${name} but no such model exists in schema.prisma.`);
    process.exit(1);
  }
}

/* ── Relation extraction (one line per FK side) ──────────────────────────── */
function backRefMultiplicity(parentName, childName, relName) {
  const parent = models.get(parentName);
  if (!parent) return 'many';
  const candidates = parent.fields.filter((f) => f.type === childName && !f.relation?.fkFields?.length);
  const match =
    candidates.find((f) => relName && f.relation?.name === relName) ??
    candidates.find((f) => !f.relation?.name && !relName) ??
    candidates[0];
  if (!match) return 'many';
  return match.isArray ? 'many' : 'one';
}

const relations = []; // {parent, child, label, parentCard}
for (const [childName, { fields }] of models) {
  for (const f of fields) {
    if (!f.relation || f.relation.fkFields.length === 0) continue;
    const parentName = f.type;
    const label = f.relation.name ?? f.name;
    relations.push({
      parent: parentName,
      child: childName,
      label,
      parentCard: backRefMultiplicity(parentName, childName, f.relation.name),
    });
  }
}

function relLine({ parent, child, label, parentCard }) {
  // left side is parent cardinality exactly one; right side is children count
  const right = parentCard === 'many' ? 'o{' : 'o|';
  return `  ${parent} ||--${right} ${child} : "${label}"`;
}

/* ── Attribute rendering ─────────────────────────────────────────────────── */
const TYPE_MAP = {
  String: 'string',
  Int: 'int',
  BigInt: 'bigint',
  Float: 'float',
  Decimal: 'decimal',
  Boolean: 'boolean',
  DateTime: 'timestamptz',
  Json: 'jsonb',
  Bytes: 'bytes',
};
function attrType(f) {
  const base = TYPE_MAP[f.type] ?? (f.type.includes('(') ? 'vector' : f.type.toLowerCase());
  return f.isArray ? `${base}_arr` : base;
}
function attrLine(f) {
  const keys = [f.isId ? 'PK' : null, f.isScalarFk ? 'FK' : null].filter(Boolean).join(',');
  const comment = f.isOptional ? ' "optional"' : '';
  return `    ${attrType(f)} ${f.name}${keys ? ` ${keys}` : ''}${comment}`;
}

/* ── Document assembly ───────────────────────────────────────────────────── */
const parts = [];
parts.push(`# Database ER Diagram — generated

> GENERATED by \`infra/scripts/generate-er-diagram.mjs\` from
> \`packages/database/prisma/schema.prisma\` (byte-identical to docs/Database.md §3)
> — DO NOT EDIT BY HAND. Drift fails CI (structural-gates job). Relationship
> labels are the Prisma relation/field names; \`PK\` = primary key, \`FK\` = part of
> a \`@relation(fields:[…])\` constraint. \`optional\` marks nullable fields.
> ${modelOrder.length} models · ${relations.length} relationships.${''}
`);

parts.push(`## Overview — all ${modelOrder.length} models (relations only)

\`\`\`mermaid
erDiagram
${modelOrder.map((n) => `  ${n} {
    string id PK
  }`).join('\n')}
${relations.map(relLine).join('\n')}
\`\`\`
`);

for (const [slug, title, list] of DOMAINS) {
  const inDomain = new Set(list);
  const domainRels = relations.filter((r) => inDomain.has(r.parent) && inDomain.has(r.child));
  const crossOut = relations.filter((r) => inDomain.has(r.child) && !inDomain.has(r.parent));
  const entities = list
    .map((name) => {
      const body = models.get(name).fields.map(attrLine).join('\n');
      return `  ${name} {\n${body}\n  }`;
    })
    .join('\n');
  const crossNote =
    crossOut.length > 0
      ? `\nInbound FK from another domain: ${crossOut.map((r) => `\`${r.parent} ← ${r.child}.${r.label}\``).join(', ')}.`
      : '';
  parts.push(`## ${title} (${list.length} models)

\`\`\`mermaid
erDiagram
${entities}
${domainRels.map(relLine).join('\n')}
\`\`\`
${crossNote}
`);
}

const doc = parts.join('\n');

if (checkMode) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (current !== doc) {
    console.error(
      'ER-diagram drift: docs/diagrams/database-er.md is stale.\n' +
        'Run: node infra/scripts/generate-er-diagram.mjs',
    );
    process.exit(1);
  }
  console.log('ER-diagram check OK');
} else {
  writeFileSync(outPath, doc);
  console.log(`wrote ${outPath} (models=${modelOrder.length}, relations=${relations.length})`);
}
