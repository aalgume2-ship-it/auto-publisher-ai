/**
 * Error-mapping contract: @aca/auth's domain taxonomy → ProblemDetails codes
 * the platform already emits. Pins the security-relevant ambiguity rules:
 * every credential failure collapses to the SAME 401 (no enumeration oracle).
 */
import { describe, expect, it } from 'vitest';
import { AuthError } from '@aca/auth';
import { mapAuthError, withAuthErrorMapping } from '../src/modules/auth/auth-error-map.js';

const codes: Array<[ConstructorParameters<typeof AuthError>[0], string, number]> = [
  ['EMAIL_TAKEN', 'CONFLICT', 409],
  ['WEAK_PASSWORD', 'VALIDATION_FAILED', 400],
  ['INVALID_CREDENTIALS', 'UNAUTHENTICATED', 401],
  ['MFA_TICKET_INVALID', 'UNAUTHENTICATED', 401],
  ['MFA_INVALID_CODE', 'UNAUTHENTICATED', 401],
  ['REFRESH_REUSE_DETECTED', 'UNAUTHENTICATED', 401],
  ['SESSION_EXPIRED', 'UNAUTHENTICATED', 401],
  ['MFA_REQUIRED', 'UNAUTHENTICATED', 401],
  ['ACCOUNT_DISABLED', 'FORBIDDEN', 403],
  ['MFA_ALREADY_ENABLED', 'CONFLICT', 409],
  ['MFA_NOT_ENABLED', 'CONFLICT', 409],
  ['TOTP_KEY_MISSING', 'PLATFORM_ERROR', 503],
];

describe('mapAuthError', () => {
  it.each(codes)('%s → %s (%i)', (authCode, apiCode, status) => {
    const mapped = mapAuthError(new AuthError(authCode, 'x'));
    expect(mapped?.code).toBe(apiCode);
    expect(mapped?.status).toBe(status);
  });

  it('non-AuthError passes through as null (global filter renders INTERNAL)', () => {
    expect(mapAuthError(new Error('boom'))).toBeNull();
    expect(mapAuthError('stringly')).toBeNull();
  });

  it('withAuthErrorMapping rethrows mapped ApiError and preserves unrelated errors', async () => {
    await expect(withAuthErrorMapping(async () => { throw new AuthError('SESSION_EXPIRED', 'gone'); }))
      .rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    const original = new TypeError('unrelated');
    await expect(withAuthErrorMapping(async () => { throw original; })).rejects.toBe(original);
    await expect(withAuthErrorMapping(async () => 42)).resolves.toBe(42);
  });
});
