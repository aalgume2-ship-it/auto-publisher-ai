/**
 * Client session pocket — access token + current org in localStorage.
 * Deliberately minimal: the API's refresh-rotation flow arrives with the
 * account screen slice; today the 15-min access token is refreshed by a
 * fresh login (preview audiences).
 */
export interface StoredSession {
  accessToken: string;
  refreshToken?: string;
  orgId?: string;
  email?: string;
  displayName?: string;
}

const KEY = 'aca.session.v1';

export function loadSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return typeof parsed.accessToken === 'string' && parsed.accessToken.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(s: StoredSession): void {
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function patchSession(patch: Partial<StoredSession>): void {
  const cur = loadSession();
  if (!cur) return;
  saveSession({ ...cur, ...patch });
}

export function clearSession(): void {
  window.localStorage.removeItem(KEY);
}

/** Decodes JWT claims WITHOUT verification (display only — the API is the verifier). */
export function readClaims(token: string): { sub?: string; exp?: number; email?: string } {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload)) as { sub?: string; exp?: number; email?: string };
  } catch {
    return {};
  }
}

export function isExpired(token: string, marginSec = 30): boolean {
  const { exp } = readClaims(token);
  return typeof exp !== 'number' || exp * 1000 <= Date.now() + marginSec * 1000;
}
