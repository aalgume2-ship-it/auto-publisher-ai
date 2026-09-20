/**
 * Exclusive Admin Account Configuration
 * This account is designated as the sole exclusive administrator for the platform.
 *
 * SECURITY: the password is NOT stored here. It is seeded from the
 * EXCLUSIVE_ADMIN_PASSWORD env var (see main.ts) and must never be exposed
 * in any UI or client-facing code.
 */

export const EXCLUSIVE_ADMIN_EMAIL = '2558052235';
export const EXCLUSIVE_ADMIN_DISPLAY_NAME = 'المدير العام - المالك الحصري';
export const EXCLUSIVE_ADMIN_ORG_SLUG = 'exclusive-owner-studio';
export const EXCLUSIVE_ADMIN_ORG_NAME = 'الاستوديو الحصري للمالك';

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
