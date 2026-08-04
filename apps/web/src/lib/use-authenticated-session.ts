'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, isExpired, loadSession, refreshStoredSession, type StoredSession } from './session';

export function useAuthenticatedSession(redirectTo = '/login/') {
  const router = useRouter();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      let next = loadSession();
      if (next?.accessToken && isExpired(next.accessToken) && next.refreshToken) {
        next = await refreshStoredSession();
      }
      if (cancelled) return;
      if (!next?.accessToken) {
        clearSession();
        setReady(true);
        router.replace(redirectTo);
        return;
      }
      setSession(next);
      setReady(true);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [redirectTo, router]);

  return { session, setSession, ready };
}
