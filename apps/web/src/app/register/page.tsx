'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<RegisterResponse>('/v1/auth/register', {
        email: email.trim(),
        password,
        displayName: displayName.trim(),
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
    <div className="container auth-wrap">
      <div className="panel">
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>أنشئ حسابك</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>30 ثانية وتكون داخل منصتك — بدون بطاقة ائتمانية</p>
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
            <label htmlFor="password">كلمة المرور (12+ حرفاً)</label>
            <input id="password" type="password" dir="ltr" autoComplete="new-password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب ودخول'}
          </button>
        </form>
        <p className="form-note">
          لديك حساب؟ <Link href="/login/">دخول</Link>
        </p>
      </div>
    </div>
  );
}
