/**
 * Contract fingerprinting (docs/Contracts.md freeze enforcement, job
 * `contracts-drift-check`): turns every catalog payload schema into a stable
 * structural descriptor and hashes it. Any change to an event's shape — even
 * adding a constraint — changes the fingerprint and FAILS the contract test
 * unless the fingerprint file is intentionally regenerated (visible in PR,
 * requires the `contract-change` label + linked ADR per C1 governance).
 *
 * Zero vendor imports: zod internals only (ZodFirstPartyTypeKind is public API)
 * + a deterministic non-cryptographic hash (stability is the requirement, not
 * secrecy).
 */
import { z, ZodFirstPartyTypeKind, type ZodTypeAny } from 'zod';
import { EventCatalog, EventPayloadSchemas } from './event-catalog.js';

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Deterministic stringify: object keys sorted recursively. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const rec = value as Record<string, unknown>;
  return `{${Object.keys(rec)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`)
    .join(',')}}`;
}

/** cyrb53 — stable across processes/runtimes (no seed secrets). */
export function fingerprintHash(input: string): string {
  let h1 = 0xdeadbeef ^ 11;
  let h2 = 0x41c6ce57 ^ 11;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

interface WrappedDef {
  typeName: ZodFirstPartyTypeKind;
  innerType?: ZodTypeAny;
  schema?: ZodTypeAny;
  type?: ZodTypeAny;
  checks?: Array<Record<string, unknown>>;
  values?: unknown[];
  value?: unknown;
  options?: ZodTypeAny[] | Map<string, ZodTypeAny>;
  shape?: () => Record<string, ZodTypeAny>;
  keyType?: ZodTypeAny;
  valueType?: ZodTypeAny;
  items?: ZodTypeAny[];
  rest?: ZodTypeAny;
}

function checksOf(def: WrappedDef): Json {
  return (def.checks ?? []).map((c) => {
    const { _tsCheck, _tsChecks, ...rest } = c as Record<string, unknown>;
    void _tsCheck;
    void _tsChecks;
    return rest as Json;
  }) as unknown as Json;
}

/** Walks a zod schema into a JSON descriptor that captures its full contract surface. */
export function describeSchema(schema: ZodTypeAny, depth = 0): Json {
  if (depth > 24) return { t: 'recursive-cutoff' };
  const def = schema._def as WrappedDef;
  switch (def.typeName) {
    case ZodFirstPartyTypeKind.ZodString:
      return { t: 'string', checks: checksOf(def) };
    case ZodFirstPartyTypeKind.ZodNumber:
      return { t: 'number', checks: checksOf(def) };
    case ZodFirstPartyTypeKind.ZodBigInt:
      return { t: 'bigint' };
    case ZodFirstPartyTypeKind.ZodBoolean:
      return { t: 'boolean' };
    case ZodFirstPartyTypeKind.ZodDate:
      return { t: 'date' };
    case ZodFirstPartyTypeKind.ZodLiteral:
      return { t: 'literal', v: def.value as Json };
    case ZodFirstPartyTypeKind.ZodEnum:
    case ZodFirstPartyTypeKind.ZodNativeEnum:
      return { t: 'enum', values: [...(def.values as unknown[])].sort() as Json };
    case ZodFirstPartyTypeKind.ZodOptional:
      return { t: 'optional', of: describeSchema(def.innerType as ZodTypeAny, depth + 1) };
    case ZodFirstPartyTypeKind.ZodNullable:
      return { t: 'nullable', of: describeSchema(def.innerType as ZodTypeAny, depth + 1) };
    case ZodFirstPartyTypeKind.ZodDefault:
      return { t: 'default', of: describeSchema(def.innerType as ZodTypeAny, depth + 1) };
    case ZodFirstPartyTypeKind.ZodReadonly:
      return { t: 'readonly', of: describeSchema(def.innerType as ZodTypeAny, depth + 1) };
    case ZodFirstPartyTypeKind.ZodEffects:
      return { t: 'effects', of: describeSchema(def.schema as ZodTypeAny, depth + 1) };
    case ZodFirstPartyTypeKind.ZodBranded:
      return { t: 'branded', of: describeSchema(def.type as ZodTypeAny, depth + 1) };
    case ZodFirstPartyTypeKind.ZodPipeline:
      return { t: 'pipeline' };
    case ZodFirstPartyTypeKind.ZodArray:
      return { t: 'array', of: describeSchema(def.type as ZodTypeAny, depth + 1), checks: checksOf(def) };
    case ZodFirstPartyTypeKind.ZodObject: {
      const shape = def.shape?.() ?? {};
      const fields = Object.fromEntries(
        Object.keys(shape)
          .sort()
          .map((k) => [k, describeSchema(shape[k] as ZodTypeAny, depth + 1)]),
      );
      return { t: 'object', fields };
    }
    case ZodFirstPartyTypeKind.ZodUnion:
      return {
        t: 'union',
        options: (def.options as ZodTypeAny[]).map((o) => describeSchema(o, depth + 1)),
      };
    case ZodFirstPartyTypeKind.ZodDiscriminatedUnion: {
      const options = def.options as Map<string, ZodTypeAny>;
      return {
        t: 'discriminated',
        disc: (schema._def as { discriminator?: string }).discriminator as Json,
        options: [...options.keys()].sort().map((k) => ({ k, of: describeSchema(options.get(k) as ZodTypeAny, depth + 1) })) as Json,
      };
    }
    case ZodFirstPartyTypeKind.ZodRecord:
      return {
        t: 'record',
        key: describeSchema(def.keyType as ZodTypeAny, depth + 1),
        value: describeSchema(def.valueType as ZodTypeAny, depth + 1),
      };
    case ZodFirstPartyTypeKind.ZodTuple:
      return {
        t: 'tuple',
        items: (def.items ?? []).map((i) => describeSchema(i, depth + 1)),
        rest: def.rest ? describeSchema(def.rest, depth + 1) : null,
      };
    case ZodFirstPartyTypeKind.ZodUnknown:
      return { t: 'unknown' };
    case ZodFirstPartyTypeKind.ZodAny:
      return { t: 'any' };
    case ZodFirstPartyTypeKind.ZodVoid:
      return { t: 'void' };
    case ZodFirstPartyTypeKind.ZodNull:
      return { t: 'null' };
    case ZodFirstPartyTypeKind.ZodUndefined:
      return { t: 'undefined' };
    case ZodFirstPartyTypeKind.ZodNever:
      return { t: 'never' };
    default:
      return { t: 'unhandled', typeName: String(def.typeName) };
  }
}

/** Fingerprint of ONE event type: name + version + structural payload descriptor. */
export function eventSchemaFingerprint(type: keyof typeof EventPayloadSchemas & string): string {
  const entry = EventCatalog[type];
  const schema = EventPayloadSchemas[type];
  return fingerprintHash(
    stableStringify({
      name: type,
      version: entry.version,
      payload: describeSchema(schema),
    }),
  );
}

/** Fingerprint of the WHOLE catalog (sorted per-event fingerprints + producer/consumer metadata). */
export function catalogFingerprint(): string {
  const names = Object.keys(EventCatalog).sort() as Array<keyof typeof EventPayloadSchemas & string>;
  return fingerprintHash(
    stableStringify(
      names.map((n) => ({
        fp: eventSchemaFingerprint(n),
        producer: EventCatalog[n].producer,
        consumers: [...EventCatalog[n].consumers].sort(),
        description: EventCatalog[n].description,
      })),
    ),
  );
}

/** Machine-readable manifest used by the contract test + docs generator. */
export function catalogManifest(): Record<string, { fingerprint: string; version: number; producer: string; consumers: readonly string[]; description: string }> {
  const names = Object.keys(EventCatalog).sort() as Array<keyof typeof EventPayloadSchemas & string>;
  const out: Record<string, { fingerprint: string; version: number; producer: string; consumers: readonly string[]; description: string }> = {};
  for (const n of names) {
    out[n] = {
      fingerprint: eventSchemaFingerprint(n),
      version: EventCatalog[n].version,
      producer: EventCatalog[n].producer,
      consumers: EventCatalog[n].consumers,
      description: EventCatalog[n].description,
    };
  }
  return out;
}
