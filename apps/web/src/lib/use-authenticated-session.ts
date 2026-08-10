'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadSession, refreshStoredSession, isExpired, type StoredSession } from './session';

/**
 * Hook used by dashboard pages to ensure we have a real session before
 * rendering data. If there is no session, we redirect to /login with
 * a `next` query so the user comes back to the original page after
 * signing in.
 */
export function useAuthenticatedSession(redirectTo = '/login/') {
  const router = useRouter();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next = loadSession();
      if (next?.accessToken && isExpired(next.accessToken) && next.refreshToken) {
        next = await refreshStoredSession();
      }
      if (cancelled) return;
      if (!next?.accessToken) {
        // No session — redirect to login with the current path.
        if (typeof window !== 'undefined') {
          const here = window.location.pathname + window.location.search;
          const sep = redirectTo.includes('?') ? '&' : '?';
          const target = redirectTo.endsWith('/')
            ? `${redirectTo.replace(/\/$/, '')}?next=${encodeURIComponent(here)}`
            : `${redirectTo}${sep}next=${encodeURIComponent(here)}`;
          router.replace(target);
        }
        return;
      }
      setSession(next);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [redirectTo, router]);

  return { session, setSession, ready };
}
