/**
 * Token primitives.
 *
 * Access JWTs: HS256 (node:crypto) with FIRST-PARTY claims identical to the
 * shape apps/api's AuthGuard already verifies (sub, sid?, typ:'access', iss,
 * aud, iat, exp) — the guard needs zero changes when this package takes over
 * issuance (ADR-025 swap, as designed).
 *
 * MFA tickets: same machinery, typ:'mfa' — a ticket opens ONLY the
 * complete-mfa-login door; API guards reject it elsewhere (typ is a zod
 * literal on their side too).
 *
 * Refresh tokens: 256-bit opaque (`rt_` + base64url); only the SHA-256 hex
 * digest is ever stored (UserSession.refreshTokenHash) — a database leak
 * yields nothing usable.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const AccessClaimsSchema = z.object({
  sub: z.string().uuid(),
  sid: z.string().uuid().optional(),
  typ: z.enum(['access', 'mfa']),
  iss: z.string().min(1),
  aud: z.string().min(1),
  iat: z.number().int(),
  exp: z.number().int(),
});
export type AccessClaims = z.infer<typeof AccessClaimsSchema>;

const HEADER = { alg: 'HS256', typ: 'JWT' } as const;

const b64urlJson = (value: unknown): string => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

/**
 * Signs claims; the API's verifySessionJwt performs the mirrored strict
 * verification, so this side stays deliberately simple and side-effect free.
 */
export function signJwt(claims: AccessClaims, secret: string): string {
  const signingInput = `${b64urlJson(HEADER)}.${b64urlJson(claims)}`;
  const signature = createHmac('sha256', secret).update(signingInput, 'utf8').digest('base64url');
  return `${signingInput}.${signature}`;
}

export function buildAccessClaims(opts: {
  userId: string;
  sessionId?: string;
  typ: 'access' | 'mfa';
  issuer: string;
  audience: string;
  ttlSec: number;
  nowSec?: number;
}): AccessClaims {
  const iat = opts.nowSec ?? Math.floor(Date.now() / 1000);
  return {
    sub: opts.userId,
    ...(opts.sessionId !== undefined ? { sid: opts.sessionId } : {}),
    typ: opts.typ,
    iss: opts.issuer,
    aud: opts.audience,
    iat,
    exp: iat + opts.ttlSec,
  };
}

export function mintRefreshToken(): string {
  return `rt_${randomBytes(32).toString('base64url')}`;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
