'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { saveSession } from '../../lib/session';

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const api = await import('../../lib/studio-api');
      const r = await api.login(email.trim().toLowerCase(), password);
      if (r.ok && r.data && (r.data as any).kind === 'tokens') {
        const d = r.data as { user: { id: string; email: string; displayName: string }; tokens: { accessToken: string; refreshToken: string } };
        saveSession({
          accessToken: d.tokens.accessToken,
          refreshToken: d.tokens.refreshToken,
          email: d.user.email,
          displayName: d.user.displayName,
        });
        router.push(next);
        return;
      }
      if (r.ok && r.data && (r.data as any).kind === 'mfa_required') {
        setErr('Multi-factor verification is required. Open the dashboard on a paired device to approve.');
        return;
      }
      if (r.reachable === false) {
        setErr('API is unreachable. Verify API_UPSTREAM is configured in Vercel.');
        return;
      }
      setErr(r.error?.detail || 'Sign-in failed. Check your credentials.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ paddingTop: 60 }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass"
          style={{ maxWidth: 440, margin: '0 auto', padding: 32 }}
        >
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Welcome back</h1>
          <p className="muted" style={{ marginBottom: 18 }}>Sign in to keep creating.</p>

          {err && (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: 'rgba(255,180,180,0.08)',
                color: '#ffb4b4',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertCircle size={16} /> {err}
            </div>
          )}

          <form onSubmit={submit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              <label className="sm muted">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
              <label className="sm muted">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
            <button
              className="btn btn-primary btn-lg btn-block"
              type="submit"
              disabled={busy}
              style={{ width: '100%' }}
            >
              {busy ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="muted sm" style={{ marginTop: 18, textAlign: 'center' }}>
            New to AutoCreator? <Link href={`/signup?next=${encodeURIComponent(next)}`} style={{ color: 'var(--accent-strong)' }}>Create an account</Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
