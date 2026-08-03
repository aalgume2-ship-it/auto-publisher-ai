'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, arabicMessage, ApiProblem } from '../../lib/api';
import { clearSession, isExpired, loadSession, patchSession, readClaims, saveSession } from '../../lib/session';

/** Preview demo seat (public sandbox org, seeded daily tasks) — rotates periodically; preview-only by design. */
const DEMO_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTlmYzcwZi0wNWQ2LTc2N2YtOGE4OC0zYjNhZjE0ZDZlZTUiLCJ0eXAiOiJhY2Nlc3MiLCJpc3MiOiJodHRwczovL2FwaS5hdXRvY3JlYXRvci5haSIsImF1ZCI6ImFjYS1maXJzdC1wYXJ0eSIsImlhdCI6MTc4NTc1MTI0NiwiZXhwIjoxNzg2MzU2MDQ2fQ.j6s-lLI0qBl9iKu1enVJCvoF32_VFxQOg2DmM9qrp5A';
const DEMO_ORG_ID = '019fc70f-097c-7a39-9361-085d53c3ecd1';

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  defaultLocale: string;
  createdAt: string;
  counts: { members: number; teams: number; departments: number };
}

export default function DashboardPage() {
  const [session, setSession] = useState(loadSession());
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');

  const expired = session ? isExpired(session.accessToken) : true;

  const loadOrg = useCallback(
    async (orgId: string, token: string) => {
      const detail = await api.get<OrgDetail>(`/v1/organizations/${orgId}`, token);
      setOrg(detail);
    },
    [],
  );

  useEffect(() => {
    if (session?.orgId && !expired && !org) {
      loadOrg(session.orgId, session.accessToken).catch((e) => setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل المنظمة'));
    }
  }, [session, expired, org, loadOrg]);

  function useDemoSeat() {
    const s = {
      accessToken: DEMO_TOKEN,
      orgId: DEMO_ORG_ID,
      email: 'demo@autocreator.test',
      displayName: 'Demo Owner',
    };
    saveSession(s);
    setSession(s);
    setError(null);
    setOrg(null);
  }

  function logout() {
    clearSession();
    setSession(null);
    setOrg(null);
  }

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<OrgDetail>('/v1/organizations', { name: newOrgName.trim(), timezone: 'Asia/Riyadh' }, session.accessToken);
      patchSession({ orgId: created.id });
      setSession(loadSession());
      setOrg(created);
      setNewOrgName('');
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر إنشاء المنظمة');
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- anonymous ---------------- */
  if (!session || expired) {
    return (
      <div className="container auth-wrap">
        <div className="panel" style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>لوحة التحكم تتطلب جلسة</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
            {session && expired ? 'انتهت صلاحية رمز الجلسة — سجّل الدخول من جديد أو استخدم المقعد التجريبي.' : 'سجّل الدخول بحسابك، أو جرّب المقعد الجاهز فوراً.'}
          </p>
          <div className="actions" style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link className="btn btn-primary" href="/login/">
              تسجيل الدخول
            </Link>
            <Link className="btn btn-ghost" href="/register/">
              حساب جديد
            </Link>
            <button className="btn btn-ghost" onClick={useDemoSeat}>
              ⚡ تجربة فورية (Demo Org جاهزة)
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- signed in ---------------- */
  return (
    <div className="container dash">
      <div className="dash-head">
        <div>
          <h1 style={{ fontSize: 26 }}>لوحة التحكم</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13.5 }} className="mono">
            {session.email ?? readClaims(session.accessToken).sub ?? ''}
          </p>
        </div>
        <div className="row">
          <button className="btn btn-ghost" onClick={logout}>
            خروج
          </button>
        </div>
      </div>

      {error && <div className="alert err">{error}</div>}

      {org ? (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>{org.name}</h3>
              <span className={`badge ${org.status === 'ACTIVE' ? 'live' : 'soon'}`}>{org.status}</span>
            </div>
            <dl className="kv" style={{ marginTop: 14 }}>
              <dt>المعرّف (slug)</dt>
              <dd>{org.slug}</dd>
              <dt>المنطقة الزمنية</dt>
              <dd>{org.timezone}</dd>
              <dt>اللغة الافتراضية</dt>
              <dd>{org.defaultLocale}</dd>
              <dt>أُنشئت</dt>
              <dd>{new Date(org.createdAt).toLocaleDateString('ar-SA-u-nu-latn')}</dd>
            </dl>
          </div>
          <div className="card">
            <h3>هيكل المنظمة</h3>
            <div className="row" style={{ marginTop: 14, gap: 18, fontSize: 15 }}>
              <span>👥 أعضاء: <strong>{org.counts.members}</strong></span>
              <span>🧩 فِرق: <strong>{org.counts.teams}</strong></span>
              <span>🏛️ أقسام: <strong>{org.counts.departments}</strong></span>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14 }}>
              إدارة الفِرق والأدوار متاحة عبر الـ API الموثّق — شاشات الإدارة المرئية في شريحة الواجهة التالية.
            </p>
          </div>
          <div className="card">
            <h3>🚀 القنوات والنشر التلقائي</h3>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8 }}>
              ربط قنوات YouTube وخط إنتاج الفيديو هما الوحدة القادمة على خارطة الطريق — ستلاحظ ظهورهما هنا فور الإطلاق.
            </p>
            <span className="badge soon" style={{ marginTop: 10 }}>المرحلة القادمة</span>
          </div>
        </div>
      ) : (
        <div className="panel" style={{ maxWidth: 560 }}>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>أنشئ منظمتك الأولى</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
            المنظمة هي خزانة عملك: القنوات والفيديوهات والفِرق تعيش داخلها بعزل كامل.
          </p>
          <form onSubmit={createOrg}>
            <div className="field">
              <label htmlFor="orgname">اسم المنظمة</label>
              <input id="orgname" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="مثال: قنوات نور الإعلامية" required minLength={2} />
            </div>
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? 'جارٍ الإنشاء…' : 'إنشاء المنظمة (ستصبح مالكها)'}
            </button>
          </form>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14 }}>
            أو <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={useDemoSeat}>افتح Demo Org الجاهزة</button>
          </p>
        </div>
      )}
    </div>
  );
}
