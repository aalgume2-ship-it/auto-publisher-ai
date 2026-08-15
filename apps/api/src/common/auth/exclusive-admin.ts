/**
 * Exclusive Admin Account Configuration
 * This account is designated as the sole exclusive administrator for the platform
 * as per owner request. Credentials are intentionally hardcoded for immediate access.
 * 
 * SECURITY NOTE: This is a highly privileged account with weak credentials (as requested).
 * In production, it should be protected by additional factors and monitored.
 * The password is intentionally simple per owner specification.
 */

export const EXCLUSIVE_ADMIN_EMAIL = '2558052235';
export const EXCLUSIVE_ADMIN_PASSWORD = '1234';
export const EXCLUSIVE_ADMIN_DISPLAY_NAME = 'المدير العام - المالك الحصري';
export const EXCLUSIVE_ADMIN_ORG_SLUG = 'exclusive-owner-studio';
export const EXCLUSIVE_ADMIN_ORG_NAME = 'الاستوديو الحصري للمالك';

/**
 * Check if the given credentials match the exclusive admin account
 */
export function isExclusiveAdminCredentials(email: string, password: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  return normalizedEmail === EXCLUSIVE_ADMIN_EMAIL.toLowerCase() && password === EXCLUSIVE_ADMIN_PASSWORD;
}

/**
 * Check if email belongs to exclusive admin (for bypassing validations)
 */
export function isExclusiveAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === EXCLUSIVE_ADMIN_EMAIL.toLowerCase();
}

/**
 * Validate email allowing exclusive admin as exception
 * Normal emails must be valid email format, exclusive admin can be numeric string
 */
export function isValidEmailWithExclusiveAdminException(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  if (trimmed === EXCLUSIVE_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }
  // Standard email regex
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}
