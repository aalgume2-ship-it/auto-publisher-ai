/**
 * Password hashing — scrypt via node:crypto (NIST SP 800-132; zero native
 * deps so previews/containers never compile anything).
 *
 * Stored format: `scrypt$N$r$p$<base64 salt>$<base64 derived-key>` — the
 * parameters travel with the hash so cost can be raised later and
 * `needsRehash()` flags legacy rows on next successful login.
 *
 * OWASP cheat-sheet aligned parameters: N=2^14, r=8, p=1 (~16 MiB memory /
 * ~50–100 ms on modest hardware), 32-byte derived key, 16-byte random salt.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

export const CURRENT_SCRYPT_PARAMS: ScryptParams = { N: 16_384, r: 8, p: 1 };
const KEY_LENGTH = 32; // bytes — balances scrypt's internal 128 MiB cap math with N*r*p*128
const SALT_BYTES = 16;
// scrypt throws unless maxmem >= 128*N*r*p (+slack); derive from params instead of hardcoding.
const maxmemFor = ({ N, r, p }: ScryptParams): number => 128 * N * r * p + 1024 * 1024;

export async function hashPassword(password: string, params: ScryptParams = CURRENT_SCRYPT_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH, { ...params, maxmem: maxmemFor(params) });
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export interface ParsedPasswordHash {
  params: ScryptParams;
  salt: Buffer;
  derived: Buffer;
}

/** Throws on any malformed/non-scrypt value — callers map to invalid-credentials, never partial-trust. */
export function parsePasswordHash(stored: string): ParsedPasswordHash {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') throw new Error('unsupported password hash format');
  const [, nStr, rStr, pStr, saltB64, derivedB64] = parts as [string, string, string, string, string, string];
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N < 1024 || (N & (N - 1)) !== 0) {
    throw new Error('malformed scrypt parameters');
  }
  const salt = Buffer.from(saltB64, 'base64');
  const derived = Buffer.from(derivedB64, 'base64');
  if (salt.length === 0 || derived.length === 0) throw new Error('malformed scrypt material');
  return { params: { N, r, p }, salt, derived };
}

/** Constant-time verification; returns false (never throws detail-leaking errors) on bad input. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const { params, salt, derived } = parsePasswordHash(stored);
    const candidate = await scrypt(password, salt, derived.length, { ...params, maxmem: maxmemFor(params) });
    return candidate.length === derived.length && timingSafeEqual(candidate, derived);
  } catch {
    return false;
  }
}

/** True when the stored hash predates current cost parameters — rehash transparently on login. */
export function needsRehash(stored: string, current: ScryptParams = CURRENT_SCRYPT_PARAMS): boolean {
  try {
    const { params } = parsePasswordHash(stored);
    return params.N !== current.N || params.r !== current.r || params.p !== current.p;
  } catch {
    return true;
  }
}
