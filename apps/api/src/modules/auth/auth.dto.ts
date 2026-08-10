/**
 * Auth module — request contracts (zod = runtime truth) + OpenAPI doc
 * schemas with REAL examples, kept side-by-side (same-file co-evolution).
 */
import { z } from 'zod';
import { EXCLUSIVE_ADMIN_EMAIL } from '../../common/auth/exclusive-admin.js';

const exclusiveAdminEmail = EXCLUSIVE_ADMIN_EMAIL.toLowerCase();
const emailSchema = z.string().trim().toLowerCase().max(254).refine(
  (val) => {
    if (val === exclusiveAdminEmail) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  },
  { message: 'Invalid email' }
);
const passwordSchema = z.string().min(1).max(512);

/* ----------------------------------------------------------- zod (truth) 
 * Updated to support exclusive admin account (2558052235 / 1234) as special case
 */

export const RegisterBody = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(120),
  locale: z.string().trim().min(2).max(16).default('en'),
  timezone: z.string().trim().min(1).max(64).default('UTC'),
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = z.object({
  email: emailSchema,
  password: passwordSchema,
  deviceName: z.string().trim().min(1).max(120).optional(),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const MfaCompleteBody = z.object({
  mfaTicket: z.string().min(20),
  code: z.string().regex(/^\d{6,8}$/),
  deviceName: z.string().trim().min(1).max(120).optional(),
});
export type MfaCompleteBody = z.infer<typeof MfaCompleteBody>;

export const RefreshBody = z.object({
  refreshToken: z.string().min(10).max(256),
});
export type RefreshBody = z.infer<typeof RefreshBody>;

export const LogoutBody = RefreshBody;
export type LogoutBody = z.infer<typeof LogoutBody>;

export const ChangePasswordBody = z.object({
  oldPassword: z.string().min(1).max(512),
  newPassword: z.string().min(12).max(512),
});
export type ChangePasswordBody = z.infer<typeof ChangePasswordBody>;

export const TotpConfirmBody = z.object({
  code: z.string().regex(/^\d{6,8}$/),
});
export type TotpConfirmBody = z.infer<typeof TotpConfirmBody>;

export const TotpDisableBody = z.object({
  password: z.string().min(1).max(512),
});
export type TotpDisableBody = z.infer<typeof TotpDisableBody>;

/* ---------------------------------------------------- OpenAPI doc schemas */

export const RegisterBodyDoc = {
  type: 'object' as const,
  required: ['email', 'password', 'displayName'],
  properties: {
    email: { type: 'string', format: 'email', example: 'sara@noormedia.sa' },
    password: { type: 'string', minLength: 12, example: 'Riyadh-2026!long-passphrase' },
    displayName: { type: 'string', example: 'Sara Alotaibi' },
    locale: { type: 'string', example: 'ar-SA' },
    timezone: { type: 'string', example: 'Asia/Riyadh' },
  },
};

export const LoginBodyDoc = {
  type: 'object' as const,
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email', example: 'sara@noormedia.sa' },
    password: { type: 'string', example: 'Riyadh-2026!long-passphrase' },
    deviceName: { type: 'string', example: 'iPhone 16 Pro — Safari' },
  },
};

export const TokensDoc = {
  type: 'object' as const,
  properties: {
    tokenType: { type: 'string', example: 'Bearer' },
    accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…' },
    accessTokenExpiresAt: { type: 'string', format: 'date-time', example: '2026-08-03T13:15:00.000Z' },
    refreshToken: { type: 'string', example: 'rt_9wW2kYwHq4r0y8Jg8m0n8v0x8Sd2h3O9kL1pQzR4sT5uVw' },
    refreshTokenExpiresAt: { type: 'string', format: 'date-time', example: '2026-09-02T13:00:00.000Z' },
    sessionId: { type: 'string', format: 'uuid', example: '019fc720-8fea-7cd3-a1b2-390aaf0d2f71' },
  },
};

export const AuthUserDoc = {
  type: 'object' as const,
  properties: {
    id: { type: 'string', format: 'uuid', example: '019fc72a-1111-7cd3-a1b2-390aaf0d2f71' },
    email: { type: 'string', format: 'email', example: 'sara@noormedia.sa' },
    displayName: { type: 'string', example: 'Sara Alotaibi' },
    locale: { type: 'string', example: 'ar-SA' },
    timezone: { type: 'string', example: 'Asia/Riyadh' },
    emailVerifiedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
    mfaEnabled: { type: 'boolean', example: false },
  },
};

export const LoginResultDoc = {
  oneOf: [
    {
      type: 'object' as const,
      properties: { kind: { type: 'string', enum: ['tokens'] }, user: AuthUserDoc, tokens: TokensDoc },
      required: ['kind', 'user', 'tokens'],
    },
    {
      type: 'object' as const,
      properties: {
        kind: { type: 'string', enum: ['mfa_required'] },
        mfaTicket: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…(typ:mfa)' },
        expiresInSec: { type: 'integer', example: 300 },
      },
      required: ['kind', 'mfaTicket', 'expiresInSec'],
    },
  ],
};

export const TotpEnrollDoc = {
  type: 'object' as const,
  properties: {
    secret: { type: 'string', example: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', description: 'Base32 — manual entry fallback' },
    uri: { type: 'string', example: 'otpauth://totp/AutoCreator%20AI:sara%40noormedia.sa?secret=JBSW…&issuer=AutoCreator%20AI&digits=6&period=30', description: 'Encode as QR for the authenticator app' },
  },
};
