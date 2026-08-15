'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import StudioNav from '../../components/studio/StudioNav';
import { signupWith } from '../../lib/studio-session';
import { oauthEnabled, OAUTH_GOOGLE_URL, OAUTH_APPLE_URL } from '../../lib/studio-api';

function GoogleIcon() { return <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.2 18.9 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C41.7 36.1 44 30.6 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>; }
function AppleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.86-3.08.38-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.38C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>; }

function SignupInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/subscribe';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);

  function redirectToSubscribe() {
    router.push(next === '/subscribe' ? next : `/subscribe?next=${encodeURIComponent(next)}`);
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    setBusy(true); setErr(null); setRetryMsg(null);
    const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    // The API client already performs a short, idempotency-safe retry. Do not
    // wrap it in another 5-attempt loop: nested retries made a dead upstream
    // look like a five-minute signup spinner and could submit duplicate POSTs.
    setRetryMsg('Processing — جاري إنشاء الحساب…');
    const res = await signupWith(email.trim().toLowerCase(), password, name);
    if (res.ok) { setBusy(false); setRetryMsg(null); redirectToSubscribe(); return; }

    setBusy(false);
    setRetryMsg(null);
    if (res.retryable) {
      setErr('تعذر الاتصال بخدمة الحساب الآن. تأكد من تشغيل الـ API ثم حاول مرة أخرى.');
    } else {
      setErr(res.message);
    }
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" /><div className="aurora a2" /><div className="grain" />
      <StudioNav minimal />
      <main className="shell">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="glass auth-wrap">
          <h1>Create your account</h1>
          <p className="hint">Sign up securely — you'll choose a plan next.</p>
          {err && <div className="alert err" style={{ marginBottom: 14 }}>{err}</div>}
          {retryMsg && <div className="alert" style={{ marginBottom: 14, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: '#eaffc7', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>{retryMsg}</div>}
          <div className="soc-row">
            <button className="soc-btn" disabled={!oauthEnabled('google')} title={oauthEnabled('google') ? '' : 'Configure GOOGLE_OAUTH_URL to enable'} onClick={() => { if (OAUTH_GOOGLE_URL) window.location.href = OAUTH_GOOGLE_URL; }}>
              <GoogleIcon /> Google
            </button>
            <button className="soc-btn" disabled={!oauthEnabled('apple')} title={oauthEnabled('apple') ? '' : 'Configure APPLE_OAUTH_URL to enable'} onClick={() => { if (OAUTH_APPLE_URL) window.location.href = OAUTH_APPLE_URL; }}>
              <AppleIcon /> Apple
            </button>
          </div>
          <div className="divider">or continue with email</div>
          <form onSubmit={submitEmail}>
            <div className="field"><label>Email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></div>
            <div className="field"><label>Password</label><input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6+ characters" autoComplete="new-password" /></div>
            <button className="btn btn-primary btn-lg btn-block" disabled={busy} type="submit">{busy ? 'Creating...' : 'Create account'}</button>
          </form>
          <div className="alt">Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></div>
        </motion.div>
      </main>
    </div>
  );
}

export default function SignupPage() {
  return <Suspense fallback={null}><SignupInner /></Suspense>;
}
