/**
 * First-party session JWTs (ADR-025 interim, REAL verification — @aca/auth
 * will later own issuance; this code path is what it swaps).
 *
 * HS256 via node:crypto only: base64url(header).base64url(payload).base64url(hmac).
 * Signature compared with timingSafeEqual; exp measured in whole seconds;
 * iss/aud enforced against config; claims validated with zod.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { apiErrors } from '../errors/api-error.js';

export const SessionClaimsSchema = z.object({
  sub: z.string().uuid(),
  sid: z.string().uuid().optional(),
  typ: z.literal('access'),
  iss: z.string().min(1),
  aud: z.string().min(1),
  iat: z.number().int(),
  exp: z.number().int(),
});
export type SessionClaims = z.infer<typeof SessionClaimsSchema>;

const HEADER = { alg: 'HS256', typ: 'JWT' } as const;

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}
function b64urlJson(value: unknown): string {
  return b64urlEncode(Buffer.from(JSON.stringify(value), 'utf8'));
}
function b64urlDecodeJson(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw apiErrors.unauthenticated('token is not valid base64url JSON');
  }
}

function hmac(input: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(input, 'utf8').digest();
}

/** Mints a token (used by tests + the future login service; verification is the hot path). */
export function signSessionJwt(claims: SessionClaims, secret: string): string {
  const signingInput = `${b64urlJson(HEADER)}.${b64urlJson(claims)}`;
  return `${signingInput}.${b64urlEncode(hmac(signingInput, secret))}`;
}

export interface VerifyOptions {
  issuer: string;
  audience: string;
  nowSec?: number;
}

/** Verifies and returns claims; every failure mode is UNAUTHENTICATED with a specific detail. */
export function verifySessionJwt(token: string, secret: string, opts: VerifyOptions): SessionClaims {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => p === '')) {
    throw apiErrors.unauthenticated('malformed token');
  }
  const headerParsed = b64urlDecodeJson(parts[0] as string) as Record<string, unknown>;
  if (headerParsed['alg'] !== 'HS256' || headerParsed['typ'] !== 'JWT') {
    throw apiErrors.unauthenticated('unsupported token header');
  }
  const signingInput = `${parts[0] as string}.${parts[1] as string}`;
  const expected = hmac(signingInput, secret);
  const provided = Buffer.from(parts[2] as string, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw apiErrors.unauthenticated('invalid token signature');
  }
  const claimsParsed = SessionClaimsSchema.safeParse(b64urlDecodeJson(parts[1] as string));
  if (!claimsParsed.success) {
    throw apiErrors.unauthenticated('malformed token claims');
  }
  const claims = claimsParsed.data;
  if (claims.iss !== opts.issuer) throw apiErrors.unauthenticated('issuer mismatch');
  if (claims.aud !== opts.audience) throw apiErrors.unauthenticated('audience mismatch');
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (claims.exp <= now) throw apiErrors.unauthenticated('token expired');
  return claims;
}
