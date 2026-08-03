/**
 * Prisma-backed AuthStore — the ADAPTER from @aca/auth's persistence port to
 * the platform DbClient. Pure field pass-through: zero business logic here
 * (all rules live in the framework-free core, tested without a database).
 */
import type { DbClient } from '@aca/database';
import type {
  AuthSession,
  AuthStore,
  AuthUser,
  CreateSessionInput,
  CreateUserInput,
  SessionPatch,
} from '@aca/auth';

type DbUser = Awaited<ReturnType<DbClient['user']['findUnique']>>;
type DbSession = Awaited<ReturnType<DbClient['userSession']['findFirst']>>;

function toAuthUser(u: NonNullable<DbUser>): AuthUser {
  return {
    id: u.id,
    email: u.email,
    emailVerifiedAt: u.emailVerifiedAt,
    passwordHash: u.passwordHash,
    displayName: u.displayName,
    locale: u.locale,
    timezone: u.timezone,
    status: u.status,
    lastLoginAt: u.lastLoginAt,
    totpSecretEnc: u.totpSecretEnc,
    totpSecretKeyId: u.totpSecretKeyId,
    mfaEnabledAt: u.mfaEnabledAt,
  };
}

function toAuthSession(s: NonNullable<DbSession>): AuthSession {
  return {
    id: s.id,
    userId: s.userId,
    refreshTokenHash: s.refreshTokenHash,
    previousRefreshTokenHash: s.previousRefreshTokenHash,
    previousRotatedAt: s.previousRotatedAt,
    deviceName: s.deviceName,
    ip: s.ip,
    userAgent: s.userAgent,
    authMethod: s.authMethod,
    expiresAt: s.expiresAt,
    revokedAt: s.revokedAt,
    createdAt: s.createdAt,
  };
}

export class PrismaAuthStore implements AuthStore {
  constructor(private readonly db: DbClient) {}

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    const u = await this.db.user.findUnique({ where: { email } });
    return u ? toAuthUser(u) : null;
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    const u = await this.db.user.findUnique({ where: { id } });
    return u ? toAuthUser(u) : null;
  }

  async createUser(input: CreateUserInput): Promise<AuthUser> {
    const u = await this.db.user.create({
      data: {
        id: input.id,
        email: input.email,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        locale: input.locale,
        timezone: input.timezone,
        status: 'ACTIVE',
      },
    });
    return toAuthUser(u);
  }

  async updateUser(
    id: string,
    patch: Partial<Pick<AuthUser, 'passwordHash' | 'lastLoginAt' | 'totpSecretEnc' | 'totpSecretKeyId' | 'mfaEnabledAt' | 'emailVerifiedAt'>>,
  ): Promise<void> {
    await this.db.user.update({ where: { id }, data: patch });
  }

  async createSession(input: CreateSessionInput): Promise<AuthSession> {
    const s = await this.db.userSession.create({ data: input });
    return toAuthSession(s);
  }

  async findSessionByRefreshHash(hash: string): Promise<AuthSession | null> {
    const s = await this.db.userSession.findUnique({ where: { refreshTokenHash: hash } });
    return s ? toAuthSession(s) : null;
  }

  async findSessionByPreviousRefreshHash(hash: string): Promise<AuthSession | null> {
    const s = await this.db.userSession.findFirst({ where: { previousRefreshTokenHash: hash } });
    return s ? toAuthSession(s) : null;
  }

  async updateSession(id: string, patch: SessionPatch): Promise<void> {
    await this.db.userSession.update({ where: { id }, data: patch });
  }

  async revokeAllSessionsForUser(userId: string, exceptSessionId?: string): Promise<number> {
    const result = await this.db.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId !== undefined ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}
