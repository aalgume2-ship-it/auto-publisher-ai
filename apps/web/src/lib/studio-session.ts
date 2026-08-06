/**
 * Production session for the studio — real backend only.
 *
 * There is no local/demo fallback: every session is created by the real API
 * (/v1/auth). When the API is unreachable the caller receives a `retryable`
 * result so the UI can keep showing a friendly "Processing…" state instead of
 * a technical error, and retry automatically.
 */
import { login as apiLogin, register as apiRegister, refresh as apiRefresh, type AuthTokens } from './studio-api';

export type SessionMode = 'api';

export interface StudioSession {
  mode: SessionMode;
  user: { id: string; email: string; name: string; displayName: string; provider: string };
  tokens?: AuthTokens;
  orgId?: string;
  plan: 'trial' | 'pro' | 'studio' | 'free' | null;
}

export type SessionResult = { ok: true; session: StudioSession } | { ok: false; retryable: boolean; message: string };

const KEY = 'lumen.session.api.v1';

export function loadStudioSession(): StudioSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StudioSession) : null;
  } catch {
    return null;
  }
}
function save(s: StudioSession): void { window.localStorage.setItem(KEY, JSON.stringify(s)); }
export function persistStudioSession(s: StudioSession): void { save(s); }
export function clearStudioSession(): void { window.localStorage.removeItem(KEY); }

/** True when a live API session exists (real tokens). */
export function isApiSession(): boolean {
  const s = loadStudioSession();
  return !!s && s.mode === 'api' && !!s.tokens?.accessToken;
}

/** Best-effort token refresh so the API session stays valid. */
export async function tryRefreshToken(): Promise<boolean> {
  const s = loadStudioSession();
  if (!s || !s.tokens?.refreshToken) return false;
  const r = await apiRefresh(s.tokens.refreshToken);
  if (r.ok && r.data) { save({ ...s, tokens: r.data.tokens }); return true; }
  if (r.reachable === false) return true; // backend down now — keep existing tokens
  return false;
}

/** Sign up against the real API. Never falls back to local. */
export async function signupWith(email: string, password: string, name: string): Promise<SessionResult> {
  const r = await apiRegister(email, password, name || email.split('@')[0]);
  if (r.ok && r.data) {
    const sess: StudioSession = {
      mode: 'api',
      user: { id: r.data.user.id, email: r.data.user.email, name: r.data.user.displayName, displayName: r.data.user.displayName, provider: 'email' },
      tokens: r.data.tokens,
      orgId: r.data.workspace?.id,
      plan: null,
    };
    save(sess);
    return { ok: true, session: sess };
  }
  if (r.reachable === false) return { ok: false, retryable: true, message: 'We are still connecting you. Please wait…' };
  if (r.error?.code === 'EMAIL_TAKEN') return { ok: false, retryable: false, message: 'An account with this email already exists.' };
  return { ok: false, retryable: true, message: 'Unable to create your account right now. Please try again.' };
}

/** Sign in against the real API. Never falls back to local. */
export async function signinWith(email: string, password: string): Promise<SessionResult> {
  const r = await apiLogin(email, password);
  if (r.ok && r.data) {
    const d = r.data;
    if (d.kind === 'mfa_required') return { ok: false, retryable: false, message: 'Multi-factor verification is required for this account.' };
    const sess: StudioSession = {
      mode: 'api',
      user: { id: d.user.id, email: d.user.email, name: d.user.displayName, displayName: d.user.displayName, provider: 'email' },
      tokens: d.tokens,
      plan: null,
    };
    save(sess);
    return { ok: true, session: sess };
  }
  if (r.reachable === false) return { ok: false, retryable: true, message: 'We are still connecting you. Please wait…' };
  if (r.error?.status === 401) return { ok: false, retryable: false, message: 'Incorrect email or password.' };
  return { ok: false, retryable: true, message: 'Unable to sign you in right now. Please try again.' };
}

/** Set/update the plan on the current session. */
export function applyPlan(plan: 'trial' | 'pro' | 'studio' | 'free'): StudioSession | null {
  const s = loadStudioSession();
  if (!s) return null;
  const next = { ...s, plan };
  save(next);
  return next;
}
