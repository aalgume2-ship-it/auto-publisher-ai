'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
        saveSession({
          accessToken: res.tokens.accessToken,
          refreshToken: res.tokens.refreshToken,
        });
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
    <div className="container auth-wrap">
      <div className="panel">
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>تسجيل الدخول</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>مرحباً بعودتك إلى AutoCreator AI</p>
        {error && <div className="alert err">{error}</div>}
        <form onSubmit={submit} dir="ltr">
          {mfaTicket ? (
            <div className="field" dir="rtl">
              <label htmlFor="code">رمز تطبيق المصادقة (6 أرقام)</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} required />
            </div>
          ) : (
            <div dir="rtl">
              <div className="field">
                <label htmlFor="email">البريد الإلكتروني</label>
                <input id="email" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="password">كلمة المرور</label>
                <input id="password" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            </div>
          )}
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? 'جارٍ التحقق…' : mfaTicket ? 'تأكيد الرمز' : 'دخول'}
          </button>
        </form>
        <p className="form-note">
          ليس لديك حساب؟ <Link href="/register/" style={{ color: 'var(--brand-2)' }}>أنشئ حساباً</Link>
          {' • '}
          <Link href="/dashboard/" style={{ color: 'var(--brand-2)' }}>تجربة فورية بحساب جاهز</Link>
        </p>
      </div>
    </div>
  );
}
