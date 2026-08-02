/**
 * uuidv7 (RFC 9562 §5.7) — the ONLY id shape minted by the platform
 * (docs/API.md §1). Time-ordered so Postgres btree indexes stay healthy
 * (sequential-ish inserts) and event replay cursors can seek by id.
 *
 * Layout: 48 bits unix-ms | 4 bits version (7) | 12 bits rand |
 *         2 bits variant (10) | 62 bits rand.
 * Generator uses node:crypto CSPRNG only — no Math.random anywhere.
 */
import { randomBytes } from 'node:crypto';

const BYTE_TO_HEX: readonly string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0'),
);

export function uuidv7(nowMs: number = Date.now()): string {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError(`uuidv7: timestamp must be a non-negative safe integer, got ${nowMs}`);
  }
  const rand = randomBytes(10); // 12 + 62 random bits = 74 bits → 10 bytes (we use the low 74)
  const ms = BigInt(nowMs);

  // 16 bytes big-endian assembly
  const out = new Uint8Array(16);
  for (let i = 0; i < 6; i++) {
    out[5 - i] = Number((ms >> BigInt(8 * i)) & 0xffn);
  }
  out[6] = 0x70 | ((rand[0] as number) & 0x0f); // version 7
  out[7] = rand[1] as number;
  out[8] = 0x80 | ((rand[2] as number) & 0x3f); // variant 10
  for (let i = 0; i < 7; i++) {
    out[9 + i] = rand[3 + i] as number;
  }

  const h = (i: number) => BYTE_TO_HEX[out[i] as number];
  return (
    `${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-${h(6)}${h(7)}-` +
    `${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}`
  );
}

/** Extracts the millisecond timestamp embedded in a uuidv7 (for replay cursors/ordering). */
export function uuidv7Timestamp(id: string): number {
  const hex = id.replaceAll('-', '');
  if (!/^[0-9a-f]{12}7[0-9a-f]{19}$/i.test(hex)) {
    throw new RangeError(`uuidv7Timestamp: not a uuidv7: ${id}`);
  }
  return Number(BigInt(`0x${hex.slice(0, 12)}`));
}
