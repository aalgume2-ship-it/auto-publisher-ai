/**
 * Production session — real backend only (no mock).
 * During the current product test phase, ensureGuestSession provisions a
 * temporary real API account automatically so the user can enter Studio
 * without seeing login, signup, or subscription screens.
 */
import { login as apiLogin, register as apiRegister, refresh as apiRefresh, listOrgs, createOrg, type AuthTokens } from './studio-api';

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
/** Session pocket used by the /register page and the dashboard suite. */
const LEGACY_KEY = 'aca.session.v1';

export function loadStudioSession(): StudioSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as StudioSession;
      // Self-heal: sessions forged by the old fake exclusive-admin path are
      // rejected by the API (401 on every call). Discard them so the user is
      // cleanly routed back to login instead of staring at a stuck page.
      const forgedAdmin =
        s?.orgId === 'exclusive-owner-studio-id' ||
        s?.user?.id === 'exclusive-admin-001' ||
        (s?.tokens?.accessToken || '').endsWith('exclusive-admin-signature');
      if (forgedAdmin) {
        window.localStorage.removeItem(KEY);
        window.localStorage.removeItem(LEGACY_KEY);
        return null;
      }
      return s;
    }
    // Fall back to the session written by /register so both halves of the
    // app share one login instead of bouncing the user back to /login.
    const legacyRaw = window.localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const l = JSON.parse(legacyRaw) as { accessToken?: string; refreshToken?: string; orgId?: string; email?: string; displayName?: string };
      if (l.accessToken) {
        return {
          mode: 'api',
          user: { id: '', email: l.email || '', name: l.displayName || '', displayName: l.displayName || '', provider: 'email' },
          tokens: { accessToken: l.accessToken, refreshToken: l.refreshToken || '' },
          orgId: l.orgId,
          plan: 'trial',
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
function save(s: StudioSession): void {
  window.localStorage.setItem(KEY, JSON.stringify(s));
  // Keep the legacy dashboard suite (lib/session.ts) in sync — one login
  // for the whole app.
  try {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify({
      accessToken: s.tokens?.accessToken,
      refreshToken: s.tokens?.refreshToken,
      orgId: s.orgId,
      email: s.user?.email,
      displayName: s.user?.displayName,
    }));
  } catch {}
}
export function persistStudioSession(s: StudioSession): void { save(s); }
export function clearStudioSession(): void {
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(GUEST_KEY);
  window.localStorage.removeItem(LEGACY_KEY);
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

/**
 * Resolve the signed-in user's organization id. Every studio feature
 * (videos, series, assets) is scoped to an org, so after a real API login
 * we pick the first membership — provisioning one when none exists yet.
 */
async function resolveOrgId(token: string): Promise<string | undefined> {
  try {
    const r = await listOrgs(token);
    if (r.ok && r.data?.items?.length) {
      const active = r.data.items.find((m) => m.status !== 'REVOKED') ?? r.data.items[0];
      return active.organization?.id;
    }
    const created = await createOrg(token, 'My Studio');
    if (created.ok && created.data?.id) return created.data.id;
  } catch {}
  return undefined;
}

/** Human-readable, honest messages for auth failures (no fake "processing"). */
function authErrorMessage(err: { status?: number; code?: string; detail?: string } | undefined, fallback: string): string {
  const code = err?.code;
  if (code === 'WEAK_PASSWORD') return 'كلمة المرور يجب ألا تقل عن 12 حرفاً — Password must be at least 12 characters.';
  if (code === 'EMAIL_TAKEN' || code === 'CONFLICT') return 'هذا البريد مسجّل مسبقاً — An account with this email already exists.';
  if (err?.status === 401 || code === 'UNAUTHENTICATED') return 'البريد أو كلمة المرور غير صحيحة — Incorrect email or password.';
  if (code === 'VALIDATION_FAILED') return 'تحقق من البيانات (كلمة المرور 12 حرفاً فأكثر) — Please check your details.';
  if (err?.status && err.status >= 400 && err.status < 500) return err.detail || fallback;
  return fallback;
}

/** Sign up against the real API. */
export async function signupWith(email: string, password: string, name: string): Promise<SessionResult> {
  const r = await apiRegister(email, password, name || email.split('@')[0]);
  if (r.ok && r.data) {
    const orgId = r.data.workspace?.id ?? (await resolveOrgId(r.data.tokens.accessToken));
    const sess: StudioSession = {
      mode: 'api',
      user: { id: r.data.user.id, email: r.data.user.email, name: r.data.user.displayName, displayName: r.data.user.displayName, provider: 'email' },
      tokens: r.data.tokens,
      orgId,
      // Start on a free trial immediately — no paywall stop after signup.
      plan: orgId ? 'trial' : null,
    };
    save(sess);
    return { ok: true, session: sess };
  }
  if (r.reachable === false) return { ok: false, retryable: true, message: 'Processing — جاري المعالجة, نعيد المحاولة تلقائياً خلال ثوانٍ' };
  if (r.error?.code === 'EMAIL_TAKEN' || r.error?.code === 'CONFLICT') return { ok: false, retryable: false, message: 'هذا البريد مسجّل مسبقاً — An account with this email already exists.' };
  if (r.error?.status === 502 || r.error?.status === 503 || r.error?.code === 'COLD_START' || r.error?.code === 'UPSTREAM_UNREACHABLE') {
    return { ok: false, retryable: true, message: 'Processing — جاري المعالجة, نعيد المحاولة تلقائياً' };
  }
  // Honest client errors (weak password, invalid email…) must not masquerade
  // as connectivity problems.
  if (r.error?.status && r.error.status >= 400 && r.error.status < 500) {
    return { ok: false, retryable: false, message: authErrorMessage(r.error, 'Unable to create your account. Please check your details.') };
  }
  return { ok: false, retryable: true, message: r.error?.detail || 'Unable to create your account right now. Please try again.' };
}

/** Sign in against the real API. */
export async function signinWith(email: string, password: string): Promise<SessionResult> {
  const r = await apiLogin(email, password);
  if (r.ok && r.data) {
    const d = r.data;
    if ((d as any).kind === 'mfa_required') return { ok: false, retryable: false, message: 'Multi-factor verification is required for this account.' };
    const dd = d as { user: { id: string; email: string; displayName: string }; tokens: AuthTokens };
    // Real login, real org: resolve the user's workspace so every studio
    // feature works immediately (no fake org ids, no rejected tokens).
    const orgId = await resolveOrgId(dd.tokens.accessToken);
    const sess: StudioSession = {
      mode: 'api',
      user: { id: dd.user.id, email: dd.user.email, name: dd.user.displayName, displayName: dd.user.displayName, provider: 'email' },
      tokens: dd.tokens,
      orgId,
      plan: orgId ? 'trial' : null,
    };
    save(sess);
    return { ok: true, session: sess };
  }
  if (r.reachable === false) return { ok: false, retryable: true, message: 'Processing — جاري المعالجة, نعيد المحاولة تلقائياً' };
  if (r.error?.status === 401 || r.error?.code === 'UNAUTHENTICATED') return { ok: false, retryable: false, message: 'البريد أو كلمة المرور غير صحيحة — Incorrect email or password.' };
  if (r.error?.status === 502 || r.error?.status === 503 || r.error?.code === 'COLD_START' || r.error?.code === 'UPSTREAM_UNREACHABLE') {
    return { ok: false, retryable: true, message: 'Processing — جاري المعالجة, نعيد المحاولة تلقائياً' };
  }
  if (r.error?.status && r.error.status >= 400 && r.error.status < 500) {
    return { ok: false, retryable: false, message: authErrorMessage(r.error, 'Unable to sign you in. Please check your details.') };
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
