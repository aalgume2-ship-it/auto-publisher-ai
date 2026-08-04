'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, arabicMessage, ApiProblem } from '../../lib/api';
import { saveSession } from '../../lib/session';

interface TokensResponse {
  kind: 'tokens';
  user: { id: string; email: string; displayName: string };
  tokens: { accessToken: string; refreshToken: string };
}
interface MfaResponse {
  kind: 'mfa_required';
  mfaTicket: string;
}
type LoginResponse = TokensResponse | MfaResponse;

const HIGHLIGHTS = [
  { title: 'Workspace-ready sessions', body: 'جلسات حقيقية قابلة للتحديث مع وصول مباشر إلى لوحة التحكم.' },
  { title: 'Studio-grade security', body: 'Auth + refresh rotation + دعم MFA داخل مسار واحد نظيف.' },
  { title: 'Fast operator flow', body: 'من تسجيل الدخول إلى إدارة المحتوى خلال ثوانٍ.' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  async function finishLogin(res: LoginResponse) {
    if (res.kind === 'mfa_required') {
      setMfaTicket(res.mfaTicket);
      return;
    }
    saveSession({
      accessToken: res.tokens.accessToken,
      refreshToken: res.tokens.refreshToken,
      email: res.user.email,
      displayName: res.user.displayName,
    });
    router.push('/dashboard/');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mfaTicket) {
        const res = await api.post<TokensResponse>('/v1/auth/mfa/complete', { mfaTicket, code: mfaCode.trim() });
        saveSession({ accessToken: res.tokens.accessToken, refreshToken: res.tokens.refreshToken });
        router.push('/dashboard/');
      } else {
        const res = await api.post<LoginResponse>('/v1/auth/login', { email: email.trim(), password });
        await finishLogin(res);
      }
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر الاتصال — أعد المحاولة');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-grid">
        <motion.section
          className="auth-showcase glass-card"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div>
            <span className="eyebrow">Secure Studio Access</span>
            <h1 style={{ fontSize: 'clamp(42px, 5vw, 74px)', lineHeight: 0.98, marginTop: 18 }}>
              Login to the <span className="gradient-text">operator cockpit</span>.
            </h1>
            <p style={{ color: 'var(--text-soft)', maxWidth: 560, marginTop: 18 }}>
              Access your premium AI workspace, asset pipelines, publishing stack and team operations with a polished dark-mode experience.
            </p>
          </div>
          <div className="auth-highlights">
            {HIGHLIGHTS.map((item) => (
              <div key={item.title} className="auth-highlight">
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.div className="auth-panel" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.08 }}>
          <div className="auth-wrap glass-card" style={{ padding: 30 }}>
            <p className="eyebrow subtle">Member login</p>
            <h2 style={{ fontSize: 34, margin: '8px 0 10px' }}>Welcome back</h2>
            <p style={{ color: 'var(--text-soft)', marginBottom: 22 }}>Continue building inside your studio.</p>
            {error && <div className="alert err">{error}</div>}
            <form onSubmit={submit} dir="ltr">
              {mfaTicket ? (
                <div className="field" dir="rtl">
                  <label htmlFor="code">رمز تطبيق المصادقة</label>
                  <input id="code" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} required />
                </div>
              ) : (
                <>
                  <div className="field" dir="rtl">
                    <label htmlFor="email">البريد الإلكتروني</label>
                    <input id="email" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="field" dir="rtl">
                    <label htmlFor="password">كلمة المرور</label>
                    <input id="password" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                </>
              )}
              <button className="btn btn-primary btn-block" disabled={busy} type="submit">
                {busy ? 'Signing in…' : mfaTicket ? 'Confirm MFA' : 'Enter Studio'} <ArrowLeft size={18} />
              </button>
            </form>
            <div className="row" style={{ marginTop: 18, color: 'var(--muted)', fontSize: 14 }}>
              <span className="row"><ShieldCheck size={16} /> Secure session</span>
              <span className="row"><Sparkles size={16} /> Premium dashboard</span>
              <span className="row"><LockKeyhole size={16} /> MFA ready</span>
            </div>
            <p className="form-note">ليس لديك حساب؟ <Link href="/register/">إنشاء حساب</Link></p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
