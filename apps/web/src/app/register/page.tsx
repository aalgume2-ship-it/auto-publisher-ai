'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, arabicMessage, ApiProblem } from '../../lib/api';
import { saveSession } from '../../lib/session';

interface RegisterResponse {
  user: { id: string; email: string; displayName: string };
  tokens: { accessToken: string; refreshToken: string };
  workspace?: { id: string; name: string; slug: string } | null;
}

const NAME_PLACEHOLDER = 'مثال: محمد العتيبي';

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
    const trimmedName = displayName.trim();
    const finalDisplayName =
      trimmedName.length > 0
        ? trimmedName
        : email
            .trim()
            .split('@')[0]
            .replace(/[._+-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() || 'مستخدم جديد';
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
        // The backend auto-provisions the user's first workspace during
        // registration — persist it so the dashboard opens straight into it.
        orgId: res.workspace?.id,
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
            <span className="eyebrow">ابدأ الآن</span>
            <h1 style={{ fontSize: 'clamp(40px, 5vw, 68px)', lineHeight: 1.05, marginTop: 18 }}>
              أنشئ حسابك وابدأ <span className="gradient-text">الإنتاج الذكي</span> خلال ثوانٍ.
            </h1>
            <p style={{ color: 'var(--text-soft)', maxWidth: 560, marginTop: 18 }}>
              كل ما تحتاجه جاهز من اللحظة الأولى: مساحة عمل، إعدادات افتراضية، ولوحة تحكم متكاملة — دون أي خطوات إضافية.
            </p>
          </div>
          <div className="auth-highlights">
            <div className="auth-highlight"><strong>بدون إعدادات</strong><p>يتم تجهيز كل شيء تلقائياً خلف الكواليس عند التسجيل.</p></div>
            <div className="auth-highlight"><strong>بدأ سريع</strong><p>من إنشاء الحساب إلى لوحة التحكم خلال ثوانٍ.</p></div>
            <div className="auth-highlight"><strong>بالعربية</strong><p>واجهة بسيطة وواضحة تناسب الجميع.</p></div>
          </div>
        </motion.section>

        <motion.div className="auth-panel" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.08 }}>
          <div className="auth-wrap glass-card" style={{ padding: 30 }}>
            <h2 style={{ fontSize: 34, margin: '8px 0 10px' }}>إنشاء حساب</h2>
            <p style={{ color: 'var(--text-soft)', marginBottom: 22 }}>أدخل بياناتك للبدء فوراً.</p>
            {error && <div className="alert err">{error}</div>}
            <form onSubmit={submit} dir="rtl">
              <div className="field">
                <label htmlFor="name">الاسم</label>
                <input
                  id="name"
                  autoComplete="name"
                  placeholder={NAME_PLACEHOLDER}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="email">البريد الإلكتروني</label>
                <input id="email" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="password">كلمة المرور (12+ حرفاً)</label>
                <input id="password" type="password" dir="ltr" autoComplete="new-password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <button className="btn btn-primary btn-block" disabled={busy} type="submit">
                {busy ? 'جارٍ إنشاء حسابك…' : 'إنشاء حساب'} <ArrowLeft size={18} />
              </button>
            </form>
            <p className="form-note" style={{ marginTop: 18 }}>
              لديك حساب بالفعل؟ <Link href="/login/">تسجيل الدخول</Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
