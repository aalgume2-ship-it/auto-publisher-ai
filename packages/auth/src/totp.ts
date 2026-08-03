/**
 * TOTP — RFC 6238 over HMAC-SHA1 (RFC 4226 HOTP), 6 digits, 30 s step,
 * authenticator-app compatible. node:crypto only; base32 codec implemented
 * inline (RFC 4648, uppercase alphabet, padding tolerated on decode).
 *
 * Security posture:
 *  - secrets are 160-bit (20 bytes) by default — RFC 4226 minimum;
 *  - verification window ±1 step (±30 s) absorbs authenticator/phone skew;
 *  - codes compared on the numeric string AFTER full-window evaluation so
 *    early-exit timing never leaks which step matched;
 *  - replays within the validity window are inherent to TOTP — mitigation
 *    (step-reuse tracking) lives at the service layer via Redis, roadmap item.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Strict: rejects any character outside the alphabet (padding ignored). Throws on malformed input. */
export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/=+$/u, '').replace(/\s+/gu, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('malformed base32 secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export interface TotpOptions {
  /** Code digits (6 standard; 8 used by the RFC 6238 reference vectors). */
  digits?: number;
  /** Step size in seconds. */
  stepSec?: number;
  /** Unix seconds; defaults to now. */
  forTimeSec?: number;
}

/** HOTP(T) per RFC 4226/6238 — exposed for tests + enrollment previews. */
export function totpCode(secretBase32: string, opts: TotpOptions = {}): string {
  const digits = opts.digits ?? 6;
  const stepSec = opts.stepSec ?? 30;
  const forTimeSec = opts.forTimeSec ?? Math.floor(Date.now() / 1000);
  const counter = Math.floor(forTimeSec / stepSec);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secretBase32)).update(counterBuf).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Constant-work verification across the full ±window — evaluates every step
 * then timing-compares, instead of early-returning at the first match.
 */
export function verifyTotp(secretBase32: string, code: string, opts: TotpOptions & { window?: number } = {}): boolean {
  if (!/^\d{6,8}$/u.test(code)) return false;
  const window = opts.window ?? 1;
  const stepSec = opts.stepSec ?? 30;
  const now = opts.forTimeSec ?? Math.floor(Date.now() / 1000);
  let matched = false;
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = totpCode(secretBase32, { ...opts, forTimeSec: now + offset * stepSec });
    const a = Buffer.from(candidate);
    const b = Buffer.from(code);
    if (a.length === b.length && timingSafeEqual(a, b)) matched = true;
  }
  return matched;
}

/** otpauth:// URI for QR enrollment (Google Authenticator / Authy compatible). */
export function totpUri(opts: { issuer: string; accountName: string; secretBase32: string }): string {
  const issuer = encodeURIComponent(opts.issuer);
  const account = encodeURIComponent(opts.accountName);
  return `otpauth://totp/${issuer}:${account}?secret=${opts.secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
