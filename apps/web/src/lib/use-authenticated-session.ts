'use client';

import { useEffect, useState } from 'react';
import { loadSession, type StoredSession } from './session';

/**
 * Preview/demo replacement for the old auth guard.
 *
 * It always resolves with a guest session — no redirect, no API call.
 * When the real auth flow is re-enabled, this file is reverted to the
 * previous `useAuthenticatedSession` (which redirected to /login).
 */
export function useAuthenticatedSession(_redirectTo = '/login/') {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let s = loadSession();
    if (!s) {
      // Auto-issue a guest session so the page renders without auth.
      s = {
        accessToken: 'guest.' + Math.random().toString(36).slice(2, 12),
        orgId: 'guest',
        email: 'guest@local',
        displayName: 'Guest',
      };
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('aca.session.v1', JSON.stringify(s));
        }
      } catch {
        /* ignore */
      }
    }
    setSession(s);
    setReady(true);
  }, []);

  return { session, setSession, ready };
}
