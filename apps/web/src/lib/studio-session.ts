/**
 * Studio session — wraps the persistent auth session (lib/session.ts)
 * with the studio's view of "logged in / not logged in".
 *
 * If the persistent session is empty (or expired), the studio treats
 * the user as a guest and shows sign-in prompts. We never auto-create
 * a session here — guest mode has been removed; sign-in is real.
 */
import { loadSession, type StoredSession } from './session';

export type SessionMode = 'authenticated';

export interface StudioSession {
  mode: SessionMode;
  user: { id: string; email: string; name: string; displayName: string; provider: string };
  tokens?: { accessToken: string; refreshToken: string };
  orgId?: string;
  plan: 'trial' | 'pro' | 'studio' | 'free' | null;
}

const KEY = 'lumen.session.api.v1';

export function loadStudioSession(): StudioSession | null {
  if (typeof window === 'undefined') return null;
  const stored = loadSession();
  if (!stored || !stored.accessToken) return null;
  return toStudioSession(stored);
}

export function persistStudioSession(s: StudioSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearStudioSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}

export function isApiSession(): boolean {
  return !!loadStudioSession();
}

export async function tryRefreshToken(): Promise<boolean> {
  // Defer to lib/session.refreshStoredSession which talks to the API.
  if (typeof window === 'undefined') return false;
  const { refreshStoredSession } = await import('./session');
  const next = await refreshStoredSession();
  return !!next;
}

function toStudioSession(s: StoredSession): StudioSession {
  return {
    mode: 'authenticated',
    user: {
      id: '',
      email: s.email ?? '',
      name: (s.displayName ?? s.email?.split('@')[0] ?? '') as string,
      displayName: s.displayName ?? s.email?.split('@')[0] ?? '',
      provider: 'email',
    },
    tokens: { accessToken: s.accessToken, refreshToken: s.refreshToken ?? '' },
    orgId: s.orgId,
    plan: null,
  };
}

/** Back-compat: a couple of files import `signinWith` / `signupWith` names. */
export async function signinWith(email: string, password: string) {
  const api = await import('./studio-api');
  const r = await api.login(email, password);
  if (r.ok && r.data && (r.data as any).kind === 'tokens') {
    const d = r.data as { user: { id: string; email: string; displayName: string }; tokens: { accessToken: string; refreshToken: string } };
    const { saveSession } = await import('./session');
    saveSession({ accessToken: d.tokens.accessToken, refreshToken: d.tokens.refreshToken, email: d.user.email, displayName: d.user.displayName });
    return { ok: true as const, session: toStudioSession({ accessToken: d.tokens.accessToken, refreshToken: d.tokens.refreshToken, email: d.user.email, displayName: d.user.displayName }) };
  }
  return { ok: false as const, retryable: false, message: r.error?.detail ?? 'Sign-in failed' };
}

export async function signupWith(email: string, password: string, name: string) {
  const api = await import('./studio-api');
  const r = await api.register(email, password, name);
  if (r.ok && r.data) {
    const d = r.data as { user: { id: string; email: string; displayName: string }; tokens: { accessToken: string; refreshToken: string } };
    const { saveSession } = await import('./session');
    saveSession({ accessToken: d.tokens.accessToken, refreshToken: d.tokens.refreshToken, email: d.user.email, displayName: d.user.displayName });
    return { ok: true as const, session: toStudioSession({ accessToken: d.tokens.accessToken, refreshToken: d.tokens.refreshToken, email: d.user.email, displayName: d.user.displayName }) };
  }
  return { ok: false as const, retryable: false, message: r.error?.detail ?? 'Sign-up failed' };
}

export function applyPlan(plan: 'trial' | 'pro' | 'studio' | 'free'): StudioSession | null {
  const cur = loadStudioSession();
  if (!cur) return null;
  // `cur` is a StudioSession already. Just override `plan`.
  const next: StudioSession = { ...cur, plan };
  persistStudioSession(next);
  return next;
}
