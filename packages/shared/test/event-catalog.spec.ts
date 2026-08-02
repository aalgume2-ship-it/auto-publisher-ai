/**
 * EVENT CONTRACT GUARD (requirement: any contract change must fail CI).
 *
 * 1. Catalog completeness — every EventNames row has exactly one catalog entry,
 *    with producer, >=1 consumer, description, version 1, and a payload schema.
 * 2. Envelope v1.1 — additive ADR-024 fields accepted; invariants held.
 * 3. FINGERPRINT — the live catalog manifest must equal the committed golden
 *    file byte-for-byte. Drift here = someone changed an event contract.
 *    Regeneration policy: `pnpm --filter @aca/shared run fingerprint:update`,
 *    only allowed on PRs carrying the `contract-change` label + linked ADR.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  EventEnvelopeSchema,
  EventNames,
} from '../src/contracts/events.js';
import {
  assertCatalogComplete,
  catalogEntryFor,
  EventCatalog,
  EventPayloadSchemas,
  payloadSchemaFor,
  validateEventPayload,
  ConsumerIds,
} from '../src/contracts/event-catalog.js';
import {
  catalogFingerprint,
  catalogManifest,
  describeSchema,
  eventSchemaFingerprint,
  stableStringify,
} from '../src/contracts/event-fingerprint.js';

const goldenPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'event-catalog.fingerprint.json',
);

describe('event catalog completeness', () => {
  it('covers EventNames exactly (no missing, no orphans)', () => {
    expect(assertCatalogComplete(EventNames)).toEqual([]);
  });

  it('every catalog type is grammatically valid for EventEnvelopeSchema (regression: aca.video.deleted depth)', () => {
    for (const name of EventNames) {
      const probe = {
        id: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55',
        type: name,
        version: 1,
        orgId: null,
        aggregateType: 'X',
        aggregateId: 'x',
        occurredAt: '2026-08-01T12:00:00Z',
        payload: {},
      };
      expect(EventEnvelopeSchema.safeParse(probe).success, name).toBe(true);
    }
  });

  it('every entry declares version 1, a producer, >=1 known consumer, and a description', () => {
    const consumers = new Set<string>(ConsumerIds);
    for (const name of EventNames) {
      const entry = catalogEntryFor(name);
      expect(entry, name).toBeDefined();
      if (!entry) continue;
      expect(entry.version, name).toBe(1);
      expect(entry.producer.length, name).toBeGreaterThan(0);
      expect(entry.consumers.length, name).toBeGreaterThan(0);
      for (const c of entry.consumers) expect(consumers.has(c as never), `${name} → unknown consumer "${c}"`).toBe(true);
      expect(entry.description.length, name).toBeGreaterThan(8);
      expect(payloadSchemaFor(name), name).toBeDefined();
    }
  });

  it('count is stable at 76 events (append-only; 58 v1.0-foundation + 18 ADR-027)', () => {
    expect(Object.keys(EventCatalog)).toHaveLength(76);
    expect(Object.keys(EventPayloadSchemas)).toHaveLength(76);
  });
});

describe('envelope v1.1 (ADR-024 additive fields)', () => {
  const base = {
    id: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55',
    type: 'aca.pipeline.run.started',
    version: 1,
    orgId: '8c9d0e1f-2a3b-4c5d-9e6f-7a8b9c0d1e2f',
    aggregateType: 'PipelineRun',
    aggregateId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55',
    occurredAt: '2026-08-01T12:00:00Z',
    payload: {},
  };

  it('accepts envelopes without the v1.1 fields (old producers keep working)', () => {
    expect(EventEnvelopeSchema.safeParse(base).success).toBe(true);
  });

  it('accepts envelopes with the full causal chain', () => {
    const out = EventEnvelopeSchema.safeParse({
      ...base,
      correlationId: base.id,
      causationId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e56',
      producer: 'apps/worker',
      metadata: { replayOf: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e56' },
    });
    expect(out.success).toBe(true);
  });

  it('causationId may be explicitly null (chain start)', () => {
    expect(EventEnvelopeSchema.safeParse({ ...base, causationId: null }).success).toBe(true);
  });
});

describe('payload validation', () => {
  it('validates a correct payload end-to-end', () => {
    const out = validateEventPayload('aca.video.generated', {
      orgId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55',
      projectId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e56',
      videoId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e57',
      runId: '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e58',
      durationMs: 42000,
      qualityScore: 86,
    });
    expect(out).toEqual({ ok: true });
  });

  it('rejects unknown event types and malformed payloads with precise issues', () => {
    expect(validateEventPayload('aca.nope.nothing.here', {}).ok).toBe(false);
    const bad = validateEventPayload('aca.video.generated', { durationMs: -1 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('BAD_PAYLOAD');
  });
});

describe('contract fingerprint (CI freeze)', () => {
  it('structural descriptors are deterministic', () => {
    const a = stableStringify(describeSchema(EventPayloadSchemas['aca.pipeline.run.started']));
    const b = stableStringify(describeSchema(EventPayloadSchemas['aca.pipeline.run.started']));
    expect(a).toBe(b);
    expect(eventSchemaFingerprint('aca.pipeline.run.started')).toBe(eventSchemaFingerprint('aca.pipeline.run.started'));
  });

  it('drifts when the payload shape changes', () => {
    const h1 = stableStringify(describeSchema(z.object({ a: z.string() })));
    const h2 = stableStringify(describeSchema(z.object({ a: z.string().max(5) })));
    expect(h1).not.toBe(h2);
  });

  it('live catalog matches the committed fingerprint manifest EXACTLY', () => {
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as {
      catalog: string;
      events: Record<string, { fingerprint: string }>;
    };
    expect(catalogFingerprint()).toBe(golden.catalog);
    const live = catalogManifest();
    expect(Object.keys(live).sort()).toEqual(Object.keys(golden.events).sort());
    for (const [name, meta] of Object.entries(golden.events)) {
      expect(live[name]?.fingerprint, `contract drift on ${name}`).toBe(meta.fingerprint);
    }
  });
});
