/**
 * Stream sharding (Architecture §7.3): per-aggregate ordering is guaranteed by
 * routing `hash(aggregateId) % shardCount` — every envelope of one aggregate
 * lands in exactly one physical stream, and consumers of that shard see it in
 * append order. Logical stream `events:<domain>` ⇒ physical `events:<domain>:<slot>`.
 */

/** FNV-1a 32-bit — same deterministic hash family across relay, consumers, replay. */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function shardSlotForAggregate(aggregateId: string, shardCount: number): number {
  if (!Number.isInteger(shardCount) || shardCount < 1 || shardCount > 256) {
    throw new RangeError(`shardCount must be an integer in [1,256], got ${shardCount}`);
  }
  return fnv1a32(aggregateId) % shardCount;
}

/** Physical redis key for a logical stream slot. Slot 0..shardCount-1, zero-padded for ops readability. */
export function streamKey(logicalStream: string, slot: number, shardCount: number): string {
  if (slot < 0 || slot >= shardCount) throw new RangeError(`slot ${slot} outside [0,${shardCount})`);
  if (shardCount === 1) return logicalStream;
  return `${logicalStream}:${String(slot).padStart(3, '0')}`;
}

export function allStreamKeys(logicalStream: string, shardCount: number): string[] {
  const keys: string[] = [];
  for (let slot = 0; slot < shardCount; slot++) keys.push(streamKey(logicalStream, slot, shardCount));
  return keys;
}

/** Parses a physical key back to (logical, slot). Unsharded keys ⇒ slot 0. */
export function parseStreamKey(key: string, shardCount: number): { logical: string; slot: number } {
  if (shardCount === 1) return { logical: key, slot: 0 };
  const suffix = key.slice(-4);
  if (!suffix.startsWith(':') || !/^\d{3}$/.test(suffix.slice(1))) {
    throw new Error(`not a sharded stream key: "${key}"`);
  }
  return { logical: key.slice(0, -4), slot: Number.parseInt(suffix.slice(1), 10) };
}

/** Composite entry id encoding slot for ack routing: "<slot>#<redis-entry-id>". */
export function compositeEntryId(slot: number, entryId: string): string {
  return `${slot}#${entryId}`;
}

export function parseCompositeEntryId(composite: string): { slot: number; entryId: string } {
  const hash = composite.indexOf('#');
  if (hash <= 0 || hash === composite.length - 1) {
    throw new Error(`invalid composite entry id: "${composite}"`);
  }
  const slot = Number.parseInt(composite.slice(0, hash), 10);
  if (!Number.isInteger(slot) || slot < 0) throw new Error(`invalid slot in composite id: "${composite}"`);
  return { slot, entryId: composite.slice(hash + 1) };
}
