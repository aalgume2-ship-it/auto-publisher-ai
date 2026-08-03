/**
 * @aca/auth — public surface.
 * Core rule: no framework, no Prisma, no vendor SDKs — the API layer adapts.
 */
export { hashPassword, needsRehash, parsePasswordHash, verifyPassword, CURRENT_SCRYPT_PARAMS } from './password.js';
export { EnvelopeDecryptError, SecretEnvelope, keyringFromHex, type EnvelopeKeyring } from './envelope.js';
export { base32Decode, base32Encode, generateTotpSecret, totpCode, totpUri, verifyTotp } from './totp.js';
export { AccessClaimsSchema, buildAccessClaims, hashRefreshToken, mintRefreshToken, signJwt, type AccessClaims } from './tokens.js';
export { AuthError, authError, type AuthErrorCode } from './errors.js';
export type {
  AuthSession,
  AuthStore,
  AuthUser,
  CreateSessionInput,
  CreateUserInput,
  SessionPatch,
} from './store.js';
export {
  AuthService,
  RegisterInputSchema,
  type AuthServiceConfig,
  type IssuedTokens,
  type LoginResult,
  type PublicUser,
  type RequestContext,
} from './service.js';
