/**
 * AuthService over an in-memory AuthStore — the full Phase-0 flows:
 * register → login → (MFA arm → MFA login) → refresh rotation & reuse
 * detection → logout → changePassword. Frozen clock everywhere; TOTP codes
 * minted deterministically at the frozen time.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { AuthService, type AuthServiceConfig } from '../src/service.js';
import type { AuthSession, AuthStore, AuthUser, CreateSessionInput, CreateUserInput, SessionPatch } from '../src/store.js';
import { SecretEnvelope } from '../src/envelope.js';
import { totpCode } from '../src/totp.js';
import { hashRefreshToken } from '../src/tokens.js';

const T0 = 1_780_000_000; // frozen unix time
let clock = T0;

class MemoryStore implements AuthStore {
  users = new Map<string, AuthUser>();
  sessions = new Map<string, AuthSession>();
  async findUserByEmail(email: string) { return [...this.users.values()].find((u) => u.email === email) ?? null; }
  async findUserById(id: string) { return this.users.get(id) ?? null; }
  async createUser(input: CreateUserInput): Promise<AuthUser> {
    const user: AuthUser = {
      ...input, emailVerifiedAt: null, lastLoginAt: null,
      totpSecretEnc: null, totpSecretKeyId: null, mfaEnabledAt: null, status: 'ACTIVE',
    };
    this.users.set(user.id, user);
    return user;
  }
  async updateUser(id: string, patch: Partial<AuthUser>) { Object.assign(this.users.get(id), patch); }
  async createSession(input: CreateSessionInput): Promise<AuthSession> {
    const s: AuthSession = { ...input, previousRefreshTokenHash: null, previousRotatedAt: null, revokedAt: null, createdAt: new Date(clock * 1000) };
    this.sessions.set(s.id, s);
    return s;
  }
  async findSessionByRefreshHash(h: string) { return [...this.sessions.values()].find((s) => s.refreshTokenHash === h) ?? null; }
  async findSessionByPreviousRefreshHash(h: string) { return [...this.sessions.values()].find((s) => s.previousRefreshTokenHash === h) ?? null; }
  async updateSession(id: string, patch: SessionPatch) { Object.assign(this.sessions.get(id), patch); }
  async revokeAllSessionsForUser(userId: string, except?: string) {
    let n = 0;
    for (const s of this.sessions.values()) if (s.userId === userId && s.id !== except && s.revokedAt === null) { s.revokedAt = new Date(clock * 1000); n += 1; }
    return n;
  }
}

const config: AuthServiceConfig = {
  jwtSecret: 'test-secret-at-least-32-bytes-long-xx',
  jwtIssuer: 'https://api.autocreator.ai',
  jwtAudience: 'aca-first-party',
  accessTokenTtlSec: 900,
  refreshTokenTtlSec: 30 * 86_400,
  refreshGraceMs: 45_000,
  passwordMinLength: 12,
  totpIssuer: 'AutoCreator AI',
  totpEnvelope: new SecretEnvelope({ key: Buffer.alloc(32, 0x42), keyId: 'test-k1' }),
  now: () => new Date(clock * 1000),
};

const REGISTER = {
  email: 'Sara@AutoCreator.ai ',
  password: 'Riyadh-2026-Never-Gonna-Guess',
  displayName: 'Sara',
};

function decodeClaims(jwt: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split('.')[1] as string, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('AuthService', () => {
  let store: MemoryStore;
  let svc: AuthService;

  beforeEach(() => {
    clock = T0;
    store = new MemoryStore();
    svc = new AuthService(store, config);
  });

  it('register normalizes email, hashes password, issues access+refresh (sid claim bound)', async () => {
    const { user, tokens } = await svc.register(REGISTER);
    expect(user.email).toBe('sara@autocreator.ai');
    const stored = store.users.get(user.id)!;
    expect(stored.passwordHash!.startsWith('scrypt$')).toBe(true);
    expect(stored.passwordHash!.includes(REGISTER.password)).toBe(false);
    const claims = decodeClaims(tokens.accessToken);
    expect(claims).toMatchObject({ sub: user.id, sid: tokens.sessionId, typ: 'access', iss: config.jwtIssuer, aud: config.jwtAudience });
    expect(store.sessions.get(tokens.sessionId)!.refreshTokenHash).toBe(hashRefreshToken(tokens.refreshToken));
  });

  it('register rejects duplicates and weak passwords', async () => {
    await svc.register(REGISTER);
    await expect(svc.register({ ...REGISTER, email: 'sara@autocreator.ai' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN', statusHint: 409 });
    await expect(svc.register({ ...REGISTER, email: 'other@aca.ai', password: 'short' })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    await expect(svc.register({ ...REGISTER, email: 'other@aca.ai', password: 'xx-other-xx-other-xx' })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
  });

  it('login happy path; unknown email/work password identical error; disabled accounts blocked', async () => {
    const { user } = await svc.register(REGISTER);
    const res = await svc.login(' sara@autocreator.AI', REGISTER.password);
    expect(res.kind).toBe('tokens');
    await expect(svc.login('ghost@nowhere.dev', REGISTER.password)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(svc.login(REGISTER.email, 'not-the-password-1')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    store.users.get(user.id)!.status = 'SUSPENDED';
    await expect(svc.login(REGISTER.email, REGISTER.password)).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED', statusHint: 403 });
  });

  it('MFA: enrollment arms only after a valid code; login then requires ticket+code', async () => {
    const { user } = await svc.register(REGISTER);
    const { secret, uri } = await svc.startTotpEnrollment(user.id);
    expect(uri).toContain('otpauth://totp/');
    // enrollment not armed yet → password login still plain
    expect((await svc.login(REGISTER.email, REGISTER.password)).kind).toBe('tokens');
    // wrong confirm code does not arm
    await expect(svc.confirmTotpEnrollment(user.id, '000000')).rejects.toMatchObject({ code: 'MFA_INVALID_CODE' });
    const good = totpCode(secret, { forTimeSec: clock });
    await svc.confirmTotpEnrollment(user.id, good);
    expect(store.users.get(user.id)!.mfaEnabledAt).not.toBeNull();
    // login now returns a 5-min mfa ticket, NOT tokens
    const gated = await svc.login(REGISTER.email, REGISTER.password);
    if (gated.kind !== 'mfa_required') throw new Error('expected mfa_required');
    expect(decodeClaims(gated.mfaTicket)).toMatchObject({ sub: user.id, typ: 'mfa' });
    // wrong code / access-token-as-ticket rejected
    await expect(svc.completeMfaLogin(gated.mfaTicket, '000000')).rejects.toMatchObject({ code: 'MFA_INVALID_CODE' });
    const done = await svc.completeMfaLogin(gated.mfaTicket, totpCode(secret, { forTimeSec: clock }));
    expect(decodeClaims(done.tokens.accessToken)).toMatchObject({ sub: user.id, typ: 'access' });
    // expired ticket (minted at T0, TTL 300 s) rejected after the clock passes it
    clock += 301;
    await expect(svc.completeMfaLogin(gated.mfaTicket, totpCode(secret, { forTimeSec: clock }))).rejects.toMatchObject({ code: 'MFA_TICKET_INVALID' });
  });

  it('refresh rotates; in-grace retry is safe; out-of-grace reuse revokes the session', async () => {
    const { tokens } = await svc.register(REGISTER);
    // rotate once
    const rot1 = await svc.refresh(tokens.refreshToken);
    expect(rot1.tokens.refreshToken).not.toBe(tokens.refreshToken);
    expect(rot1.tokens.sessionId).toBe(tokens.sessionId);
    // immediate double-submit (lost response): still within grace → safe re-rotation
    clock += 5;
    const rot2 = await svc.refresh(tokens.refreshToken);
    expect(rot2.tokens.sessionId).toBe(tokens.sessionId);
    // out-of-grace replay of the stolen old token → reuse detected + session killed
    clock += 60;
    await expect(svc.refresh(tokens.refreshToken)).rejects.toMatchObject({ code: 'REFRESH_REUSE_DETECTED' });
    const s = store.sessions.get(tokens.sessionId)!;
    expect(s.revokedAt).not.toBeNull();
    // even the LATEST token is dead with the session
    await expect(svc.refresh(rot2.tokens.refreshToken)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('refresh of unknown/expired session → SESSION_EXPIRED; logout is idempotent', async () => {
    await expect(svc.refresh('rt_unknown')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    const { tokens } = await svc.register(REGISTER);
    await svc.logout(tokens.refreshToken);
    await expect(svc.refresh(tokens.refreshToken)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await svc.logout(tokens.refreshToken); // no throw — idempotent
  });

  it('changePassword verifies old, upgrades hash, revokes ALL sessions, issues fresh', async () => {
    const { user, tokens } = await svc.register(REGISTER);
    await svc.login(REGISTER.email, REGISTER.password); // 2nd session
    expect([...store.sessions.values()].filter((s) => s.revokedAt === null).length).toBe(2);
    await expect(svc.changePassword(user.id, 'wrong-current-pw', 'New-Unbreakable-2026!!')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const res = await svc.changePassword(user.id, REGISTER.password, 'New-Unbreakable-2026!!');
    const alive = [...store.sessions.values()].filter((s) => s.revokedAt === null);
    expect(alive.length).toBe(1);
    expect(alive[0]!.id).toBe(res.tokens.sessionId);
    expect((await svc.login(REGISTER.email, 'New-Unbreakable-2026!!')).kind).toBe('tokens');
    await expect(svc.refresh(tokens.refreshToken)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('TOTP paths fail closed when the envelope is not configured', async () => {
    const bare = new AuthService(store, { ...config, totpEnvelope: undefined });
    const { user } = await svc.register(REGISTER);
    await expect(bare.startTotpEnrollment(user.id)).rejects.toMatchObject({ code: 'TOTP_KEY_MISSING', statusHint: 503 });
    await expect(svc.disableTotp(user.id, REGISTER.password)).rejects.toMatchObject({ code: 'MFA_NOT_ENABLED' });
  });
});
