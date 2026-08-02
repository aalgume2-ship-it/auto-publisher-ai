import { describe, expect, it } from 'vitest';
import { entryIdNewer } from '../src/dedup.js';

describe('entryIdNewer (stream-id ordering)', () => {
  it('compares ms first, then seq', () => {
    expect(entryIdNewer('2-0', '1-999')).toBe(true);
    expect(entryIdNewer('1-999', '2-0')).toBe(false);
    expect(entryIdNewer('1700000000001-0', '1700000000000-42')).toBe(true);
  });

  it('same ms: seq breaks ties', () => {
    expect(entryIdNewer('1-1', '1-0')).toBe(true);
    expect(entryIdNewer('1-0', '1-1')).toBe(false);
    expect(entryIdNewer('1-1', '1-1')).toBe(false); // never newer than itself
  });

  it('monotonic advance protects the cursor against out-of-order duplicates', () => {
    // the exact guard that keeps consumer_cursors moving only forward
    expect(entryIdNewer('1-0', '1-5')).toBe(false);
  });
});
