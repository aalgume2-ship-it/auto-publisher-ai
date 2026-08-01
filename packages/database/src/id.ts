/**
 * RFC 9562 UUIDv7 generator.
 *
 * Layout: 48-bit unix-epoch ms | ver(7) | 12-bit monotonic counter | var(10) | 62 random bits.
 * Time-ordered ⇒ index-friendly primary keys (B-tree locality), monotonic within the
 * same millisecond via the counter, globally unique via 62 + 12 entropy bits.
 *
 * This module is the ONLY place ids are minted for database rows (schema has no
 * DB-side defaults by design — ids are application-owned, ADR-018 shard key shape).
 */
import { randomBytes } from 'node:crypto';

let lastMs = 0;
let counter = Math.floor(Math.random() * 0xfff); // random start avoids prediction across restarts

function monotonicParts(): { ms: number; seq: number } {
  const now = Date.now();
  if (now === lastMs) {
    counter = (counter + 1) & 0xfff;
    if (counter === 0) {
      // Counter wrapped inside one ms — wait for the next millisecond (≤ 4096 ids/ms per process).
      while (Date.now() === lastMs) {
        /* spin: worst-case ~0.25 ms */
      }
      return monotonicParts();
    }
  } else {
    if (now < lastMs) {
      // Clock skew backwards: keep moving forward to preserve ordering invariant.
      counter = (counter + 1) & 0xfff;
      return { ms: lastMs, seq: counter };
    }
    counter = randomBytes(2).readUInt16BE(0) & 0xfff;
  }
  lastMs = now;
  return { ms: now, seq: counter };
}

export function generateId(): string {
  const { ms, seq } = monotonicParts();
  const rand = randomBytes(8); // 64 bits: we keep 62

  const b = Buffer.allocUnsafe(16);
  b.writeUInt32BE(Math.floor(ms / 0x10000), 0); // time_high (48-bit split)
  b.writeUInt16BE(ms & 0xffff, 4);
  b.writeUInt16BE(0x7000 | (seq & 0x0fff), 6); // version 7 + rand_a counter
  rand.copy(b, 8);
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10xxxxxx

  const hex = b.toString('hex');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}

/** Extract the millisecond timestamp embedded in a v7 id (handy for cursor pagination sanity checks). */
export function idTimestamp(id: string): number {
  const hex = id.replace(/-/g, '');
  return parseInt(hex.slice(0, 8), 16) * 0x10000 + parseInt(hex.slice(8, 12), 16);
}
