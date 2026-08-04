/**
 * Client session pocket — access token + refresh token + current workspace.
 * Access tokens are short-lived; the browser renews them through the API's
 * refresh-rotation endpoint when a refresh token is present.
 */
import { API_BASE } from './api';

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

export async function refreshStoredSession(): Promise<StoredSession | null> {
  const current = loadSession();
  if (!current?.refreshToken) return current;
  try {
    const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (!res.ok) {
      clearSession();
      return null;
    }
    const json = (await res.json()) as {
      user: { email: string; displayName: string };
      tokens: { accessToken: string; refreshToken: string };
    };
    const next: StoredSession = {
      ...current,
      accessToken: json.tokens.accessToken,
      refreshToken: json.tokens.refreshToken,
      email: json.user.email,
      displayName: json.user.displayName,
    };
    saveSession(next);
    return next;
  } catch {
    clearSession();
    return null;
  }
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
