'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardNav from '../../../components/DashboardNav';
import { ApiProblem, api, arabicMessage } from '../../../lib/api';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  defaultLocale: string;
  counts?: { members: number; teams: number; departments: number };
}

interface Settings {
  timezone: string;
  defaultLocale: string;
  securityPolicy: { enforceSso?: boolean; enforceMfa?: boolean; sessionMaxHours?: number; ipAllowListEnabled?: boolean };
}

interface Brand {
  brandName: string | null;
  primaryColor: string;
  hidePoweredBy: boolean;
}

export default function AdminPage() {
  const { session, ready } = useAuthenticatedSession();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ timezone: 'Asia/Riyadh', defaultLocale: 'ar-SA', enforceMfa: false, sessionMaxHours: 24 });

  const load = useCallback(async () => {
    if (!session?.orgId || !session.accessToken) return;
    const [o, s, b] = await Promise.all([
      api.get<OrgDetail>(`/v1/organizations/${session.orgId}`, session.accessToken),
      api.get<Settings>(`/v1/organizations/${session.orgId}/settings`, session.accessToken),
      api.get<Brand>(`/v1/organizations/${session.orgId}/brand`, session.accessToken),
    ]);
    setOrg(o);
    setSettings(s);
    setBrand(b);
    setForm({
      timezone: s.timezone,
      defaultLocale: s.defaultLocale,
      enforceMfa: Boolean(s.securityPolicy.enforceMfa),
      sessionMaxHours: Number(s.securityPolicy.sessionMaxHours ?? 24),
    });
  }, [session]);

  useEffect(() => {
    if (!ready || !session?.orgId) return;
    void load().catch((e) => setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل لوحة الإدارة'));
  }, [ready, session, load]);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.orgId || !session.accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.patch(`/v1/organizations/${session.orgId}/settings/security-policy`, {
        enforceMfa: form.enforceMfa,
        sessionMaxHours: form.sessionMaxHours,
      }, session.accessToken);
      await api.patch(`/v1/organizations/${session.orgId}/settings`, {
        timezone: form.timezone,
        defaultLocale: form.defaultLocale,
      }, session.accessToken);
      setNotice('تم حفظ إعدادات الإدارة الأساسية.');
      await load();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر حفظ الإعدادات');
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !session) {
    return <div className="container dash"><p style={{ color: 'var(--muted)' }}>يتم التحقق من الجلسة…</p></div>;
  }

  return (
    <div className="container dash" style={{ maxWidth: 980 }}>
      <DashboardNav />
      <div className="dash-head">
        <div>
          <h1 style={{ fontSize: 26 }}>لوحة الإدارة</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>مركز إدارة Workspace: الإعدادات، العلامة التجارية، الفوترة، والأصول.</p>
        </div>
      </div>
      {error && <div className="alert err">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <section className="panel">
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>ملخص المنظمة</h2>
          {org ? (
            <dl className="kv">
              <dt>الاسم</dt><dd>{org.name}</dd>
              <dt>Slug</dt><dd>{org.slug}</dd>
              <dt>الحالة</dt><dd>{org.status}</dd>
              <dt>الأعضاء</dt><dd>{String(org.counts?.members ?? 0)}</dd>
              <dt>الفرق</dt><dd>{String(org.counts?.teams ?? 0)}</dd>
              <dt>الأقسام</dt><dd>{String(org.counts?.departments ?? 0)}</dd>
            </dl>
          ) : <p style={{ color: 'var(--muted)' }}>يتم التحميل…</p>}

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 18 }}>
            <Link className="card" href="/dashboard/billing/" style={{ display: 'block' }}>
              <h3>Billing</h3>
              <p>إدارة الملف المالي والخطط وStripe Checkout.</p>
            </Link>
            <Link className="card" href="/dashboard/assets/" style={{ display: 'block' }}>
              <h3>الأصول</h3>
              <p>رفع الشعارات والصور والفيديوهات وإدارتها.</p>
            </Link>
            <Link className="card" href="/dashboard/settings/" style={{ display: 'block' }}>
              <h3>التكاملات</h3>
              <p>AI providers وGoogle OAuth ومفاتيح الفيديو.</p>
            </Link>
            <Link className="card" href="/dashboard/channels/" style={{ display: 'block' }}>
              <h3>القنوات</h3>
              <p>إدارة روابط المنصات والقنوات.</p>
            </Link>
          </div>
        </section>

        <section className="panel">
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>سياسات الإدارة الأساسية</h2>
          <form onSubmit={saveSettings}>
            <div className="field">
              <label htmlFor="timezone">المنطقة الزمنية</label>
              <input id="timezone" value={form.timezone} onChange={(e) => setForm((cur) => ({ ...cur, timezone: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="locale">اللغة الافتراضية</label>
              <input id="locale" value={form.defaultLocale} onChange={(e) => setForm((cur) => ({ ...cur, defaultLocale: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="sessionMaxHours">أقصى مدة للجلسة (ساعة)</label>
              <input id="sessionMaxHours" type="number" min={1} max={720} value={form.sessionMaxHours} onChange={(e) => setForm((cur) => ({ ...cur, sessionMaxHours: Number(e.target.value) }))} />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
              <input type="checkbox" checked={form.enforceMfa} onChange={(e) => setForm((cur) => ({ ...cur, enforceMfa: e.target.checked }))} style={{ width: 18, height: 18 }} />
              فرض MFA على أعضاء المساحة
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'يحفظ…' : 'حفظ الإعدادات'}</button>
          </form>

          {brand && (
            <div className="card" style={{ marginTop: 18 }}>
              <h3>العلامة التجارية الحالية</h3>
              <p>الاسم: {brand.brandName ?? 'الافتراضي'}</p>
              <p>اللون الرئيسي: <span className="mono">{brand.primaryColor}</span></p>
              <p>Hide Powered By: {brand.hidePoweredBy ? 'Yes' : 'No'}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
