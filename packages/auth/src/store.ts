/**
 * AuthStore — the persistence PORT for @aca/auth (dependency-rule: the core
 * never imports Prisma/@aca/database; the API layer provides the adapter).
 * Shapes mirror the Prisma models exactly so the adapter is field-pass-through.
 */
export interface AuthUser {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  displayName: string;
  locale: string;
  timezone: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED' | string;
  lastLoginAt: Date | null;
  totpSecretEnc: string | null;
  totpSecretKeyId: string | null;
  mfaEnabledAt: Date | null;
}

export interface AuthSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  /** Hash the CURRENT one replaced — grace window for safe client retries. */
  previousRefreshTokenHash: string | null;
  previousRotatedAt: Date | null;
  deviceName: string | null;
  ip: string | null;
  userAgent: string | null;
  authMethod: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreateUserInput {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  locale: string;
  timezone: string;
}

export interface CreateSessionInput {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceName: string | null;
  ip: string | null;
  userAgent: string | null;
  authMethod: string;
  expiresAt: Date;
}

export interface SessionPatch {
  refreshTokenHash?: string;
  previousRefreshTokenHash?: string | null;
  previousRotatedAt?: Date | null;
  revokedAt?: Date | null;
  expiresAt?: Date;
}

export interface AuthStore {
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(id: string): Promise<AuthUser | null>;
  createUser(input: CreateUserInput): Promise<AuthUser>;
  updateUser(id: string, patch: Partial<Pick<AuthUser, 'passwordHash' | 'lastLoginAt' | 'totpSecretEnc' | 'totpSecretKeyId' | 'mfaEnabledAt' | 'emailVerifiedAt'>>): Promise<void>;
  createSession(input: CreateSessionInput): Promise<AuthSession>;
  findSessionByRefreshHash(hash: string): Promise<AuthSession | null>;
  findSessionByPreviousRefreshHash(hash: string): Promise<AuthSession | null>;
  updateSession(id: string, patch: SessionPatch): Promise<void>;
  revokeAllSessionsForUser(userId: string, exceptSessionId?: string): Promise<number>;
}
