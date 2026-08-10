/**
 * Exclusive Admin Configuration - Frontend
 * This is the sole exclusive administrator account as requested by owner
 */

export const EXCLUSIVE_ADMIN_EMAIL = '2558052235';
export const EXCLUSIVE_ADMIN_PASSWORD = '1234';
export const EXCLUSIVE_ADMIN_DISPLAY_NAME = 'المدير العام - المالك الحصري';

export interface ExclusiveAdminSession {
  mode: 'api';
  user: {
    id: string;
    email: string;
    name: string;
    displayName: string;
    provider: string;
    isExclusiveAdmin: true;
    role: 'SUPER_ADMIN';
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
  orgId?: string;
  plan: 'studio';
}

export function isExclusiveAdminCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === EXCLUSIVE_ADMIN_EMAIL.toLowerCase() && password === EXCLUSIVE_ADMIN_PASSWORD;
}

export function createExclusiveAdminSession(): ExclusiveAdminSession {
  // Create a locally signed admin session for immediate access
  // This bypasses API when API is unreachable or for exclusive access
  const now = Date.now();
  const payload = {
    sub: 'exclusive-admin-001',
    email: EXCLUSIVE_ADMIN_EMAIL,
    role: 'SUPER_ADMIN',
    isExclusiveAdmin: true,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + 24 * 60 * 60 * 1000) / 1000), // 24 hours
  };
  
  // Simple base64 encoding for local session (not cryptographically verified, but marked as exclusive)
  const b64 = (o: any) => {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(JSON.stringify(o)).toString('base64url');
    }
    return btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  
  const header = { alg: 'HS256', typ: 'JWT' };
  const accessToken = `${b64(header)}.${b64(payload)}.exclusive-admin-signature`;
  
  return {
    mode: 'api',
    user: {
      id: 'exclusive-admin-001',
      email: EXCLUSIVE_ADMIN_EMAIL,
      name: EXCLUSIVE_ADMIN_DISPLAY_NAME,
      displayName: EXCLUSIVE_ADMIN_DISPLAY_NAME,
      provider: 'exclusive-admin',
      isExclusiveAdmin: true,
      role: 'SUPER_ADMIN',
    },
    tokens: {
      accessToken,
      refreshToken: `exclusive-refresh-${Date.now()}`,
    },
    orgId: 'exclusive-owner-studio-id',
    plan: 'studio',
  };
}
