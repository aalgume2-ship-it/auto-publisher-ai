/**
 * AuthError (@aca/auth core taxonomy) → ApiError (ProblemDetails out the
 * single exit door). Kept as a pure function so the mapping is unit-testable
 * without booting Nest. Unknown errors pass through untouched (the global
 * filter renders them as INTERNAL).
 */
import { AuthError } from '@aca/auth';
import { ApiError, apiErrors } from '../../common/errors/api-error.js';

export function mapAuthError(err: unknown): ApiError | null {
  if (!(err instanceof AuthError)) return null;
  switch (err.code) {
    case 'EMAIL_TAKEN':
      return apiErrors.conflict(err.message);
    case 'WEAK_PASSWORD':
      return apiErrors.validationFailed([{ path: 'password', message: err.message, code: err.code }]);
    case 'REFRESH_REUSE_DETECTED':
    case 'SESSION_EXPIRED':
      return apiErrors.unauthenticated(err.message);
    case 'INVALID_CREDENTIALS':
    case 'MFA_TICKET_INVALID':
    case 'MFA_INVALID_CODE':
      // deliberate ambiguity: same 401 shape for every credential failure
      // (no user-enumeration via distinguishable error codes)
      return apiErrors.unauthenticated(err.message);
    case 'ACCOUNT_DISABLED':
      return apiErrors.forbidden(err.message);
    case 'MFA_ALREADY_ENABLED':
    case 'MFA_NOT_ENABLED':
      return apiErrors.conflict(err.message);
    case 'MFA_REQUIRED':
      return apiErrors.unauthenticated(err.message);
    case 'TOTP_KEY_MISSING':
      // deployment not configured for MFA — 503, no contract change needed
      return new ApiError('PLATFORM_ERROR', 'Service Unavailable', {
        detail: 'mfa is not enabled on this deployment',
        status: 503,
      });
    default:
      return apiErrors.unauthenticated('authentication failed');
  }
}

/** Wraps an async use-case so AuthErrors exit as ProblemDetails. */
export async function withAuthErrorMapping<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const mapped = mapAuthError(err);
    if (mapped) throw mapped;
    throw err;
  }
}
