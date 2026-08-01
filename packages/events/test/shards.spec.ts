import { describe, expect, it } from 'vitest';
import {
  allStreamKeys,
  compositeEntryId,
  fnv1a32,
  parseCompositeEntryId,
  parseStreamKey,
  shardSlotForAggregate,
  streamKey,
} from '../src/shards.js';

describe('sharding', () => {
  it('same aggregate always lands on the same slot (ordering invariant)', () => {
    const agg = '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55';
    expect(shardSlotForAggregate(agg, 64)).toBe(shardSlotForAggregate(agg, 64));
    expect(shardSlotForAggregate(agg, 64)).toBeGreaterThanOrEqual(0);
    expect(shardSlotForAggregate(agg, 64)).toBeLessThan(64);
  });

  it('distributes 10k aggregates near-uniformly over 64 slots (±35% of mean)', () => {
    const buckets = new Array<number>(64).fill(0);
    for (let i = 0; i < 10_000; i++) {
      const agg = `agg-${i.toString(36)}-${'x'.repeat(i % 7)}`;
      buckets[shardSlotForAggregate(agg, 64)] = (buckets[shardSlotForAggregate(agg, 64)] ?? 0) + 1;
    }
    const mean = 10_000 / 64;
    for (const b of buckets) {
      expect(b).toBeGreaterThan(mean * 0.65);
      expect(b).toBeLessThan(mean * 1.35);
    }
  });

  it('physical keys are zero-padded and parse back', () => {
    expect(streamKey('events:pipeline', 3, 64)).toBe('events:pipeline:003');
    expect(streamKey('events:pipeline', 63, 64)).toBe('events:pipeline:063');
    expect(streamKey('events:flags', 0, 1)).toBe('events:flags'); // unsharded
    expect(parseStreamKey('events:pipeline:003', 64)).toEqual({ logical: 'events:pipeline', slot: 3 });
    expect(parseStreamKey('events:flags', 1)).toEqual({ logical: 'events:flags', slot: 0 });
    expect(() => parseStreamKey('events:pipeline:x3', 64)).toThrow();
  });

  it('allStreamKeys enumerates exactly shardCount keys', () => {
    expect(allStreamKeys('events:billing', 4)).toEqual([
      'events:billing:000',
      'events:billing:001',
      'events:billing:002',
      'events:billing:003',
    ]);
  });

  it('composite entry ids round-trip and reject garbage', () => {
    const c = compositeEntryId(7, '1722512345678-0');
    expect(parseCompositeEntryId(c)).toEqual({ slot: 7, entryId: '1722512345678-0' });
    expect(() => parseCompositeEntryId('nohash')).toThrow();
    expect(() => parseCompositeEntryId('x#1-0')).toThrow();
  });

  it('rejects out-of-range slots/shard counts', () => {
    expect(() => streamKey('s', 64, 64)).toThrow(RangeError);
    expect(() => shardSlotForAggregate('a', 0)).toThrow(RangeError);
    expect(() => shardSlotForAggregate('a', 999)).toThrow(RangeError);
  });

  it('fnv1a32 is deterministic and well-mixed for close inputs', () => {
    expect(fnv1a32('a')).toBe(fnv1a32('a'));
    expect(fnv1a32('a')).not.toBe(fnv1a32('b'));
  });
});
