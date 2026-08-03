/**
 * AuthService composition for the API: config (API_CONFIG token) + Prisma
 * AuthStore adapter → framework-free @aca/auth core. When
 * AUTH_TOTP_ENCRYPTION_KEY is absent the service still boots — only the MFA
 * paths fail closed with TOTP_KEY_MISSING/503 (by design).
 */
import type { loadConfig } from '@aca/config';
import { AuthService, keyringFromHex, SecretEnvelope } from '@aca/auth';
import type { DbClient } from '@aca/database';
import { PRISMA } from '../../common/prisma.provider.js';
import { API_CONFIG } from '../../common/redis.provider.js';
import { PrismaAuthStore } from './prisma-auth.store.js';

export const AUTH_SERVICE = 'AUTH_SERVICE';

export const authServiceProvider = {
  provide: AUTH_SERVICE,
  useFactory: (config: ReturnType<typeof loadConfig>, db: DbClient): AuthService => {
    const totpEnvelope =
      config.auth.totpEncryptionKey !== undefined
        ? new SecretEnvelope(keyringFromHex(config.auth.totpEncryptionKey, config.auth.totpKeyId))
        : undefined;
    return new AuthService(new PrismaAuthStore(db), {
      jwtSecret: config.auth.jwtSecret ?? '',
      jwtIssuer: config.auth.jwtIssuer,
      jwtAudience: config.auth.jwtAudience,
      accessTokenTtlSec: config.auth.accessTokenTtlSec,
      refreshTokenTtlSec: config.auth.refreshTokenTtlSec,
      refreshGraceMs: config.auth.refreshGraceMs,
      passwordMinLength: config.auth.passwordMinLength,
      totpIssuer: config.auth.totpIssuer,
      totpEnvelope,
      now: () => new Date(),
    });
  },
  inject: [API_CONFIG, PRISMA],
};
