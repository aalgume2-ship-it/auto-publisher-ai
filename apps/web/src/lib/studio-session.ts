/**
 * Preview/Demo mode — guest session, no auth required.
 *
 * During preview/demos, we don't require login. Every visitor gets a
 * local "guest" session so the rest of the studio (drafts, generate,
 * result pages) keeps working without redirects to /login.
 *
 * When the real auth/subscription flow is re-enabled, this file is
 * the only one that needs to revert.
 */
import type { AuthTokens } from './studio-api';

export type SessionMode = 'guest';

export interface StudioSession {
  mode: SessionMode;
  user: { id: string; email: string; name: string; displayName: string; provider: string };
  tokens?: AuthTokens;
  orgId?: string;
  plan: 'trial' | 'pro' | 'studio' | 'free' | null;
}

const KEY = 'lumen.session.api.v1';
const GUEST_KEY = 'lumen.session.guest.v1';

function randomId(): string {
  // Lightweight unique id (not crypto — preview only).
  return 'g_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function makeGuestSession(): StudioSession {
  return {
    mode: 'guest',
    user: {
      id: 'guest',
      email: 'guest@local',
      name: 'Guest',
      displayName: 'Guest',
      provider: 'guest',
    },
    orgId: 'guest',
    plan: 'studio',
  };
}

export function loadStudioSession(): StudioSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY) ?? window.localStorage.getItem(GUEST_KEY);
    if (raw) return JSON.parse(raw) as StudioSession;
  } catch {
    // fallthrough
  }
  // Auto-create a guest session so the rest of the app never has to redirect.
  const g = makeGuestSession();
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(g));
  } catch {
    /* ignore */
  }
  return g;
}

export function persistStudioSession(s: StudioSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearStudioSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(GUEST_KEY);
}

/** True when a live API session exists (real tokens). Always true in guest mode. */
export function isApiSession(): boolean {
  return !!loadStudioSession();
}

/**
 * Best-effort token refresh. In guest mode there is nothing to refresh —
 * the function still returns true so the rest of the app doesn't redirect.
 */
export async function tryRefreshToken(): Promise<boolean> {
  return true;
}

/** Sign in — disabled in guest mode. Kept as a no-op for type compatibility. */
export async function signinWith(_email: string, _password: string): Promise<{ ok: true; session: StudioSession } | { ok: false; retryable: boolean; message: string }> {
  return { ok: true, session: loadStudioSession() as StudioSession };
}

/** Sign up — disabled in guest mode. Kept as a no-op for type compatibility. */
export async function signupWith(_email: string, _password: string, _name: string): Promise<{ ok: true; session: StudioSession } | { ok: false; retryable: boolean; message: string }> {
  return { ok: true, session: loadStudioSession() as StudioSession };
}

/** Set/update the plan on the current session. */
export function applyPlan(plan: 'trial' | 'pro' | 'studio' | 'free'): StudioSession | null {
  const s = loadStudioSession();
  if (!s) return null;
  const next = { ...s, plan };
  persistStudioSession(next);
  return next;
}

/** Issue a guest access token that the studio flow can pass through. */
export function guestAccessToken(): string {
  return 'guest.' + randomId();
}
