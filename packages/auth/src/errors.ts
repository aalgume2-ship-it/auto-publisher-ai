/**
 * Auth domain errors — the single taxonomy the API layer maps to
 * ProblemDetails (UNAUTHENTICATED / CONFLICT / VALIDATION). Codes are stable
 * strings; HTTP mapping stays OUT of this package (vendor-free core).
 */
export type AuthErrorCode =
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'WEAK_PASSWORD'
  | 'MFA_REQUIRED'
  | 'MFA_INVALID_CODE'
  | 'MFA_ALREADY_ENABLED'
  | 'MFA_NOT_ENABLED'
  | 'MFA_TICKET_INVALID'
  | 'SESSION_EXPIRED'
  | 'REFRESH_REUSE_DETECTED'
  | 'TOTP_KEY_MISSING';

export class AuthError extends Error {
  readonly statusHint: number;
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    statusHint?: number,
  ) {
    super(message);
    this.name = 'AuthError';
    this.statusHint =
      statusHint ??
      (code === 'EMAIL_TAKEN'
        ? 409
        : code === 'WEAK_PASSWORD' || code === 'MFA_REQUIRED'
          ? 400
          : 401);
  }
}

export const authError = (code: AuthErrorCode, message: string, statusHint?: number): AuthError =>
  new AuthError(code, message, statusHint);
