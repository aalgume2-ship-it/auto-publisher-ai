'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

type State = { kind: 'loading' } | { kind: 'up'; version?: string } | { kind: 'down' };

/** Live API status pulled from the real /health endpoint (no mock). The chip
 *  auto-rechecks on a timer so a brief network blip recovers without a reload —
 *  no "cold start" messaging: the backend is kept warm via the deploy-side
 *  keep-alive cron, so first requests are served immediately. */
const RECHECK_MS = 30_000;

export default function HealthChip() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const check = useCallback(async (): Promise<void> => {
    try {
      const h = await api.health();
      setState({ kind: h.status === 'ok' || h.status === 'ready' ? 'up' : 'down', ...(h.version ? { version: h.version } : {}) });
    } catch {
      setState({ kind: 'down' });
    }
  }, []);

  // Initial check + periodic auto-recheck so transient failures self-heal.
  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [check]);

  const cls = state.kind === 'up' ? 'status-chip up' : state.kind === 'down' ? 'status-chip down' : 'status-chip';
  const text = state.kind === 'up' ? 'الخدمة متاحة' : state.kind === 'down' ? 'الخدمة غير متاحة' : 'جارٍ التحقق…';
  return (
    <span className={cls} title={state.kind === 'up' && state.version ? `الإصدار v${state.version}` : 'حالة الخدمة'}>
      <span className="dot" />
      {text}
    </span>
  );
}
