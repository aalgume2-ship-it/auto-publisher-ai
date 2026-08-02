import { describe, expect, it } from 'vitest';
import { UuidV7Schema } from '../src/contracts/events.js';
import { uuidv7, uuidv7Timestamp } from '../src/ids.js';

describe('uuidv7', () => {
  it('mints ids accepted by the platform UuidV7Schema', () => {
    for (let i = 0; i < 64; i++) {
      expect(UuidV7Schema.safeParse(uuidv7()).success).toBe(true);
    }
  });

  it('is time-ordered for equal/mixed timestamps', () => {
    const t0 = 1_700_000_000_000;
    const a = uuidv7(t0);
    const b = uuidv7(t0 + 1);
    expect(a < b).toBe(true);
  });

  it('embeds the timestamp (round-trip)', () => {
    const t = 1_700_000_123_456;
    expect(uuidv7Timestamp(uuidv7(t))).toBe(t);
  });

  it('never repeats (10k mints unique)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 10_000; i++) set.add(uuidv7());
    expect(set.size).toBe(10_000);
  });

  it('rejects garbage in uuidv7Timestamp', () => {
    expect(() => uuidv7Timestamp('not-a-uuid')).toThrow(RangeError);
    expect(() =>
      uuidv7Timestamp('eeb5a6f8-0000-4000-8000-000000000000'), // v4 → rejected
    ).toThrow(RangeError);
  });
});
