/**
 * Production session — real backend only (no mock).
 * During the current product test phase, ensureGuestSession provisions a
 * temporary real API account automatically so the user can enter Studio
 * without seeing login, signup, or subscription screens.
 */
import { login as apiLogin, register as apiRegister, refresh as apiRefresh, type AuthTokens } from './studio-api';
import { isExclusiveAdminCredentials, createExclusiveAdminSession } from './exclusive-admin';

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
const GUEST_KEY = 'lumen.session.guest.v1';

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
export function clearStudioSession(): void {
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(GUEST_KEY);
}

/**
 * Current temporary test mode. Creates a real backend account once per browser
 * and stores the real JWTs locally. There is no fake token and no mock API.
 */
export async function ensureGuestSession(): Promise<StudioSession | null> {
  if (typeof window === 'undefined') return null;
  const existing = loadStudioSession();
  if (existing?.tokens?.accessToken && existing.plan) return existing;

  try {
    const cachedGuest = window.localStorage.getItem(GUEST_KEY);
    if (cachedGuest) {
      const parsed = JSON.parse(cachedGuest) as { email: string; password: string };
      const login = await apiLogin(parsed.email, parsed.password);
      if (login.ok && login.data && (login.data as any).kind !== 'mfa_required') {
        const d = login.data as { user: { id: string; email: string; displayName: string }; tokens: AuthTokens };
        const session: StudioSession = {
          mode: 'api',
          user: { id: d.user.id, email: d.user.email, name: d.user.displayName, displayName: d.user.displayName, provider: 'guest' },
          tokens: d.tokens,
          plan: 'trial',
        };
        save(session);
        return session;
      }
    }

    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `guest-${id}@trial.lumen.app`;
    const password = `${id.replace(/-/g, '')}Aa9!xZ7#`;
    const displayName = 'Studio Test User';
    const r = await apiRegister(email, password, displayName);
    if (!r.ok || !r.data) return null;

    window.localStorage.setItem(GUEST_KEY, JSON.stringify({ email, password }));
    const session: StudioSession = {
      mode: 'api',
      user: { id: r.data.user.id, email: r.data.user.email, name: r.data.user.displayName, displayName: r.data.user.displayName, provider: 'guest' },
      tokens: r.data.tokens,
      orgId: r.data.workspace?.id ?? undefined,
      plan: 'trial',
    };
    save(session);
    return session;
  } catch {
    return null;
  }
}

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
  if (r.reachable === false) return true;
  return false;
}

/** Sign up against the real API. */
export async function signupWith(email: string, password: string, name: string): Promise<SessionResult> {
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

export function applyPlan(plan: 'trial' | 'pro' | 'studio' | 'free'): StudioSession | null {
  const s = loadStudioSession();
  if (!s) return null;
  const next = { ...s, plan };
  save(next);
  return next;
}
