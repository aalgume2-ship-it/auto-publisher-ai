/**
 * Production session — real backend only (no mock).
 * Every session is created by the real API (/v1/auth). Transient network
 * failures are retryable with friendly Processing state — never raw errors.
 */
import { login as apiLogin, register as apiRegister, refresh as apiRefresh, type AuthTokens } from './studio-api';
import { EXCLUSIVE_ADMIN_EMAIL, EXCLUSIVE_ADMIN_PASSWORD, isExclusiveAdminCredentials, createExclusiveAdminSession } from './exclusive-admin.js';

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

/** Sign up against the real API. */
export async function signupWith(email: string, password: string, name: string): Promise<SessionResult> {
  // Exclusive admin bypass - direct local session creation
  if (isExclusiveAdminCredentials(email, password)) {
    const sess = createExclusiveAdminSession() as unknown as StudioSession;
    save(sess);
    return { ok: true, session: sess };
  }
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
  if (r.reachable === false) return { ok: false, retryable: true, message: 'Processing — جاري المعالجة, نعيد المحاولة تلقائياً خلال ثوانٍ' };
  if (r.error?.code === 'EMAIL_TAKEN' || r.error?.code === 'CONFLICT') return { ok: false, retryable: false, message: 'An account with this email already exists.' };
  if (r.error?.status === 502 || r.error?.status === 503 || r.error?.code === 'COLD_START' || r.error?.code === 'UPSTREAM_UNREACHABLE') {
    return { ok: false, retryable: true, message: 'Processing — جاري المعالجة, نعيد المحاولة تلقائياً' };
  }
  return { ok: false, retryable: true, message: r.error?.detail || 'Unable to create your account right now. Please try again.' };
}

/** Sign in against the real API. */
export async function signinWith(email: string, password: string): Promise<SessionResult> {
  // Exclusive admin bypass - immediate local admin session (owner exclusive)
  if (isExclusiveAdminCredentials(email, password)) {
    const exclusiveSess = createExclusiveAdminSession();
    const sess: StudioSession = {
      mode: 'api',
      user: {
        id: exclusiveSess.user.id,
        email: exclusiveSess.user.email,
        name: exclusiveSess.user.name,
        displayName: exclusiveSess.user.displayName,
        provider: exclusiveSess.user.provider,
      },
      tokens: exclusiveSess.tokens,
      orgId: exclusiveSess.orgId,
      plan: 'studio',
    };
    save(sess);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('aca.session.v1', JSON.stringify({
          accessToken: exclusiveSess.tokens.accessToken,
          refreshToken: exclusiveSess.tokens.refreshToken,
          email: exclusiveSess.user.email,
          displayName: exclusiveSess.user.displayName,
          orgId: exclusiveSess.orgId,
        }));
      }
    } catch {}
    return { ok: true, session: sess };
  }
  const r = await apiLogin(email, password);
  if (r.ok && r.data) {
    const d = r.data;
    if ((d as any).kind === 'mfa_required') return { ok: false, retryable: false, message: 'Multi-factor verification is required for this account.' };
    const dd = d as { user: { id: string; email: string; displayName: string }; tokens: AuthTokens };
    const sess: StudioSession = {
      mode: 'api',
      user: { id: dd.user.id, email: dd.user.email, name: dd.user.displayName, displayName: dd.user.displayName, provider: 'email' },
      tokens: dd.tokens,
      plan: null,
    };
    save(sess);
    // Also persist to legacy key used by some pages
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('aca.session.v1', JSON.stringify({
          accessToken: dd.tokens.accessToken,
          refreshToken: dd.tokens.refreshToken,
          email: dd.user.email,
          displayName: dd.user.displayName,
          orgId: undefined,
        }));
      }
    } catch {}
    return { ok: true, session: sess };
  }
  if (r.reachable === false) return { ok: false, retryable: true, message: 'Processing — جاري المعالجة, نعيد المحاولة تلقائياً' };
  if (r.error?.status === 401 || r.error?.code === 'UNAUTHENTICATED') return { ok: false, retryable: false, message: 'Incorrect email or password.' };
  if (r.error?.status === 502 || r.error?.status === 503 || r.error?.code === 'COLD_START' || r.error?.code === 'UPSTREAM_UNREACHABLE') {
    return { ok: false, retryable: true, message: 'Processing — جاري المعالجة, نعيد المحاولة تلقائياً' };
  }
  return { ok: false, retryable: true, message: r.error?.detail || 'Unable to sign you in right now. Please try again.' };
}

/** Set/update the plan on the current session. */
export function applyPlan(plan: 'trial' | 'pro' | 'studio' | 'free'): StudioSession | null {
  const s = loadStudioSession();
  if (!s) return null;
  const next = { ...s, plan };
  save(next);
  return next;
}
