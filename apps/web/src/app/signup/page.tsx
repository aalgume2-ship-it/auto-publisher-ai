'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { saveSession } from '../../lib/session';

function SignupInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const api = await import('../../lib/studio-api');
      const r = await api.register(email.trim().toLowerCase(), password, displayName.trim() || email.split('@')[0]);
      if (r.ok && r.data) {
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
      if (r.reachable === false) {
        setErr('API is unreachable. Verify API_UPSTREAM is configured in Vercel.');
        return;
      }
      if (r.error?.code === 'EMAIL_TAKEN' || r.error?.code === 'CONFLICT') {
        setErr('An account with this email already exists. Try signing in instead.');
        return;
      }
      setErr(r.error?.detail || 'Sign-up failed. Please try again.');
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
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Create your account</h1>
          <p className="muted" style={{ marginBottom: 18 }}>Start generating videos in minutes.</p>

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
            <Field label="Display name">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How should we call you?"
                style={inputStyle}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                style={inputStyle}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                style={inputStyle}
              />
            </Field>
            <button
              className="btn btn-primary btn-lg btn-block"
              type="submit"
              disabled={busy}
              style={{ width: '100%', marginTop: 6 }}
            >
              {busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>

          <p className="muted sm" style={{ marginTop: 18, textAlign: 'center' }}>
            Already have an account?{' '}
            <Link href={`/login?next=${encodeURIComponent(next)}`} style={{ color: 'var(--accent-strong)' }}>
              Sign in
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'inherit',
  outline: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
      <label className="sm muted">{label}</label>
      {children}
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}
