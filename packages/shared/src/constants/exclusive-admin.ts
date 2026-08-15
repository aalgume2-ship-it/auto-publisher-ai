/**
 * Exclusive Admin Constants - Shared across packages
 */

export const EXCLUSIVE_ADMIN_EMAIL = '2558052235';
export const EXCLUSIVE_ADMIN_PASSWORD = '1234';
export const EXCLUSIVE_ADMIN_DISPLAY_NAME = 'المدير العام - المالك الحصري';

export function isExclusiveAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === EXCLUSIVE_ADMIN_EMAIL.toLowerCase();
}

export function isExclusiveAdminCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === EXCLUSIVE_ADMIN_EMAIL.toLowerCase() && password === EXCLUSIVE_ADMIN_PASSWORD;
}
