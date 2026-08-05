'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiProblem } from '../lib/api';
import type { StoredSession } from './session';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationState {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

const POLL_INTERVAL = 30_000; // 30 seconds

/**
 * Hook: poll for notifications from the API. Returns current items, unread
 * count and helper functions. Gracefully handles API unavailability.
 */
export function useNotifications(session: StoredSession | null) {
  const [state, setState] = useState<NotificationState>({
    items: [],
    unreadCount: 0,
    loading: false,
    error: null,
  });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!session?.accessToken || !session?.orgId) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await api.get<{ items: Notification[] }>(
        `/v1/organizations/${session.orgId}/notifications?limit=20`,
        session.accessToken,
      );
      const items = res.items ?? [];
      const unreadCount = items.filter((n) => !n.readAt).length;
      setState({ items, unreadCount, loading: false, error: null });
    } catch (err) {
      // Silently handle errors — don't show notification errors to the user
      // unless the API is completely unavailable (401 = expired session)
      const isAuth = err instanceof ApiProblem && err.status === 401;
      if (isAuth) {
        setState((prev) => ({ ...prev, loading: false }));
      } else {
        setState((prev) => ({ ...prev, loading: false, error: null }));
      }
    }
  }, [session]);

  const markAsRead = useCallback(async (id: string) => {
    if (!session?.accessToken || !session?.orgId) return;
    try {
      await api.patch(
        `/v1/organizations/${session.orgId}/notifications/${id}/read`,
        {},
        session.accessToken,
      );
      setState((prev) => ({
        ...prev,
        items: prev.items.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
        unreadCount: Math.max(0, prev.unreadCount - 1),
      }));
    } catch {
      // Silently fail — user can retry
    }
  }, [session]);

  const markAllAsRead = useCallback(async () => {
    if (!session?.accessToken || !session?.orgId) return;
    try {
      await api.patch(
        `/v1/organizations/${session.orgId}/notifications/read-all`,
        {},
        session.accessToken,
      );
      setState((prev) => ({
        ...prev,
        items: prev.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
        unreadCount: 0,
      }));
    } catch {
      // Silently fail
    }
  }, [session]);

  useEffect(() => {
    if (!session?.accessToken) return;

    // Initial fetch
    void fetchNotifications();

    // Set up polling
    intervalRef.current = setInterval(() => {
      void fetchNotifications();
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session, fetchNotifications]);

  return {
    ...state,
    refresh: fetchNotifications,
    markAsRead,
    markAllAsRead,
  };
}
