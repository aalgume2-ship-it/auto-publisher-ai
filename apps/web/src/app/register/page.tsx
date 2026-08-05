'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, Layers3, Sparkles, Wand2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, arabicMessage, ApiProblem } from '../../lib/api';
import { saveSession } from '../../lib/session';

interface RegisterResponse {
  user: { id: string; email: string; displayName: string };
  tokens: { accessToken: string; refreshToken: string };
}

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 12) {
      setError('كلمة المرور يجب ألا تقل عن 12 حرفاً');
      return;
    }
    // Fallback: if displayName is empty (e.g. browser autofill didn't fill it),
    // derive a sensible default from the local part of the email.
    const trimmedName = displayName.trim();
    const finalDisplayName =
      trimmedName.length > 0
        ? trimmedName
        : email
            .trim()
            .split('@')[0]
            .replace(/[._+-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() || 'Studio Member';
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<RegisterResponse>('/v1/auth/register', {
        email: email.trim(),
        password,
        displayName: finalDisplayName,
        locale: 'ar-SA',
        timezone: 'Asia/Riyadh',
      });
      saveSession({
        accessToken: res.tokens.accessToken,
        refreshToken: res.tokens.refreshToken,
        email: res.user.email,
        displayName: res.user.displayName,
      });
      router.push('/dashboard/');
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر الاتصال — أعد المحاولة');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-grid">
        <motion.section className="auth-showcase glass-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div>
            <span className="eyebrow">Start Creating</span>
            <h1 style={{ fontSize: 'clamp(42px, 5vw, 74px)', lineHeight: 0.98, marginTop: 18 }}>
              Launch your <span className="gradient-text">AI studio</span> in under a minute.
            </h1>
            <p style={{ color: 'var(--text-soft)', maxWidth: 560, marginTop: 18 }}>
              Create your account, enter the dashboard and start managing workspaces, channels, assets and publishing flows from a premium dark-mode interface.
            </p>
          </div>
          <div className="auth-highlights">
            <div className="auth-highlight"><strong>Production workflow</strong><p>واجهة حقيقية مبنية للعمليات اليومية وليس مجرد قالب.</p></div>
            <div className="auth-highlight"><strong>Multi-workspace</strong><p>هيكلة مناسبة للشركات والفرق والعلامات المختلفة.</p></div>
            <div className="auth-highlight"><strong>Creative velocity</strong><p>صول إلى الأصول والقنوات والاستوديو بسرعة وبشكل بصري راقٍ.</p></div>
          </div>
        </motion.section>

        <motion.div className="auth-panel" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.08 }}>
          <div className="auth-wrap glass-card" style={{ padding: 30 }}>
            <p className="eyebrow subtle">Create account</p>
            <h2 style={{ fontSize: 34, margin: '8px 0 10px' }}>Join the studio</h2>
            <p style={{ color: 'var(--text-soft)', marginBottom: 22 }}>Build your workspace foundation with a premium onboarding flow.</p>
            {error && <div className="alert err">{error}</div>}
            <form onSubmit={submit} dir="rtl">
              <div className="field">
                <label htmlFor="name">الاسم المعروض</label>
                <input id="name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="email">البريد الإلكتروني</label>
                <input id="email" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="password">كلمة المرور (12+ حرفًا)</label>
                <input id="password" type="password" dir="ltr" autoComplete="new-password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <button className="btn btn-primary btn-block" disabled={busy} type="submit">
                {busy ? 'Creating…' : 'Create Studio Access'} <ArrowLeft size={18} />
              </button>
            </form>
            <div className="row" style={{ marginTop: 18, color: 'var(--muted)', fontSize: 14 }}>
              <span className="row"><Layers3 size={16} /> Workspace-ready</span>
              <span className="row"><Sparkles size={16} /> Premium UI</span>
              <span className="row"><Wand2 size={16} /> AI studio flow</span>
            </div>
            <p className="form-note">لديك حساب بالفعل؟ <Link href="/login/">تسجيل الدخول</Link></p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
