'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type State = { kind: 'loading' } | { kind: 'up'; version?: string } | { kind: 'down' };

/** Live API status pulled from the real /health endpoint (no mock). */
export default function HealthChip() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    api
      .health()
      .then((h) => alive && setState({ kind: h.status === 'ok' || h.status === 'ready' ? 'up' : 'down', ...(h.version ? { version: h.version } : {}) }))
      .catch(() => alive && setState({ kind: 'down' }));
    return () => {
      alive = false;
    };
  }, []);
  const cls = state.kind === 'up' ? 'status-chip up' : state.kind === 'down' ? 'status-chip down' : 'status-chip';
  const text = state.kind === 'up' ? 'API Online' : state.kind === 'down' ? 'API Cold Start / Unreachable' : 'Checking API…';
  return (
    <span className={cls} title={state.kind === 'up' && state.version ? `v${state.version}` : undefined}>
      <span className="dot" />
      {text}
    </span>
  );
}
