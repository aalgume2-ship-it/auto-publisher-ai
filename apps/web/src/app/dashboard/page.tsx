'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DashboardNav from '../../components/DashboardNav';
import { ApiProblem, api, arabicMessage } from '../../lib/api';
import { clearSession, patchSession, readClaims } from '../../lib/session';
import { useAuthenticatedSession } from '../../lib/use-authenticated-session';

const TIMEZONES = [
  { value: 'Asia/Riyadh', label: 'الرياض (GMT+3)' },
  { value: 'Asia/Dubai', label: 'دبي (GMT+4)' },
  { value: 'Africa/Cairo', label: 'القاهرة (GMT+2)' },
  { value: 'Europe/London', label: 'لندن (GMT+0/+1)' },
  { value: 'UTC', label: 'التوقيت العالمي UTC' },
];

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

interface WorkspaceMembership {
  role: string;
  status: string;
  joinedAt: string;
  organization: OrgDetail;
}

interface Counts {
  channels: number;
  series: number;
  videos: number;
  posts: number;
  published: number;
  firstSeriesId: string | null;
}

export default function DashboardPage() {
  const { session, setSession, ready } = useAuthenticatedSession();
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[]>([]);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgTz, setNewOrgTz] = useState('Asia/Riyadh');

  const currentOrgId = session?.orgId ?? workspaces[0]?.organization.id ?? null;
  const claims = session?.accessToken ? readClaims(session.accessToken) : {};

  const loadWorkspaces = useCallback(async () => {
    if (!session?.accessToken) return;
    const res = await api.get<{ items: WorkspaceMembership[] }>('/v1/organizations', session.accessToken);
    setWorkspaces(res.items);
    if (!session.orgId && res.items[0]?.organization.id) {
      patchSession({ orgId: res.items[0].organization.id });
      setSession((cur) => (cur ? { ...cur, orgId: res.items[0]!.organization.id } : cur));
    }
  }, [session, setSession]);

  const loadOrg = useCallback(async (orgId: string) => {
    if (!session?.accessToken) return;
    const detail = await api.get<OrgDetail>(`/v1/organizations/${orgId}`, session.accessToken);
    setOrg(detail);
  }, [session]);

  const loadCounts = useCallback(async (orgId: string) => {
    if (!session?.accessToken) return;
    const [c, s, v, p] = await Promise.all([
      api.get<{ items: unknown[] }>(`/v1/organizations/${orgId}/channels`, session.accessToken),
      api.get<{ items: { id: string }[] }>(`/v1/organizations/${orgId}/series`, session.accessToken),
      api.get<{ items: unknown[] }>(`/v1/organizations/${orgId}/videos`, session.accessToken),
      api.get<{ items: { status: string }[] }>(`/v1/organizations/${orgId}/posts`, session.accessToken),
    ]);
    setCounts({
      channels: c.items.length,
      series: s.items.length,
      videos: v.items.length,
      posts: p.items.length,
      published: p.items.filter((t) => t.status === 'PUBLISHED').length,
      firstSeriesId: s.items[0]?.id ?? null,
    });
  }, [session]);

  useEffect(() => {
    if (!ready || !session?.accessToken) return;
    void loadWorkspaces().catch((e) => setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل مساحات العمل'));
  }, [ready, session, loadWorkspaces]);

  useEffect(() => {
    if (!session?.accessToken || !currentOrgId) return;
    void loadOrg(currentOrgId).catch((e) => setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل المنظمة'));
    void loadCounts(currentOrgId).catch((e) => setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل إحصاءات المنظمة'));
  }, [session, currentOrgId, loadOrg, loadCounts]);

  const currentMembership = useMemo(
    () => workspaces.find((w) => w.organization.id === currentOrgId) ?? null,
    [workspaces, currentOrgId],
  );

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.accessToken) return;
    if (newOrgName.trim().length < 2) {
      setError('أدخل اسم مساحة العمل (حرفان على الأقل).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<OrgDetail>(
        '/v1/organizations',
        { name: newOrgName.trim(), timezone: newOrgTz, defaultLocale: 'ar-SA' },
        session.accessToken,
      );
      patchSession({ orgId: created.id });
      setSession((cur) => (cur ? { ...cur, orgId: created.id } : cur));
      setNewOrgName('');
      await loadWorkspaces();
      setOrg(created);
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر إنشاء مساحة العمل');
    } finally {
      setBusy(false);
    }
  }

  function switchWorkspace(orgId: string) {
    patchSession({ orgId });
    setSession((cur) => (cur ? { ...cur, orgId } : cur));
    setCounts(null);
    setOrg(null);
    setError(null);
  }

  function logout() {
    clearSession();
    setSession(null);
    setOrg(null);
    setCounts(null);
  }

  if (!ready || !session) {
    return (
      <div className="container auth-wrap">
        <div className="panel" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>يتم التحقق من الجلسة…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container dash" style={{ maxWidth: 980 }}>
      <DashboardNav />
      <div className="dash-head">
        <div>
          <h1 style={{ fontSize: 26 }}>لوحة العمل</h1>
          <p style={{ fontSize: 13.5 }} className="mono">{session.email ?? claims.email ?? claims.sub ?? ''}</p>
        </div>
        <button className="btn btn-ghost" onClick={logout}>خروج</button>
      </div>

      {error && <div className="alert err">{error}</div>}

      <div className="grid" style={{ gridTemplateColumns: '1.1fr 0.9fr', alignItems: 'start' }}>
        <section className="panel">
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>مساحات العمل</h2>
          {workspaces.length === 0 ? (
            <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
              لا توجد أي مساحة عمل بعد. أنشئ أول Workspace لبدء إدارة القنوات والنشر.
            </p>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: '1fr', marginBottom: 18 }}>
              {workspaces.map((item) => {
                const active = item.organization.id === currentOrgId;
                return (
                  <button
                    key={item.organization.id}
                    className="card"
                    onClick={() => switchWorkspace(item.organization.id)}
                    style={{ textAlign: 'right', cursor: 'pointer', borderColor: active ? 'var(--brand)' : 'var(--border)' }}
                  >
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h3 style={{ marginBottom: 4 }}>🏢 {item.organization.name}</h3>
                        <p className="mono" style={{ fontSize: 12.5 }}>{item.organization.slug}</p>
                      </div>
                      <span className={`stat-chip ${active ? 'stat-ready' : 'stat-plain'}`}>{active ? 'الحالية' : item.role}</span>
                    </div>
                    <div className="row" style={{ marginTop: 12, gap: 8 }}>
                      <span className="stat-chip stat-plain">👥 {item.organization.counts?.members ?? 0} أعضاء</span>
                      <span className="stat-chip stat-plain">🎬 {item.organization.counts?.teams ?? 0} فرق</span>
                      <span className="stat-chip stat-plain">🧩 {item.organization.counts?.departments ?? 0} أقسام</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <form onSubmit={createOrg}>
            <h3 style={{ marginBottom: 12 }}>إنشاء مساحة عمل جديدة</h3>
            <div className="field">
              <label htmlFor="orgname">اسم مساحة العمل</label>
              <input id="orgname" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="مثال: قنوات نور الإعلامية" />
            </div>
            <div className="field">
              <label htmlFor="orgtz">المنطقة الزمنية</label>
              <select id="orgtz" value={newOrgTz} onChange={(e) => setNewOrgTz(e.target.value)}>
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? 'جارٍ الإنشاء…' : 'إنشاء Workspace ←'}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>الملخص التشغيلي</h2>
          {!org ? (
            <p style={{ color: 'var(--muted)' }}>اختر مساحة عمل أو أنشئ واحدة جديدة.</p>
          ) : (
            <>
              <div className="wizard-done">✓ مساحة العمل الحالية: {org.name}</div>
              <dl className="kv">
                <dt>المعرّف</dt>
                <dd>{org.slug}</dd>
                <dt>الحالة</dt>
                <dd>{org.status}</dd>
                <dt>المنطقة</dt>
                <dd>{org.timezone}</dd>
                <dt>اللغة</dt>
                <dd>{org.defaultLocale}</dd>
              </dl>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 18 }}>
                <div className="card"><h3>القنوات</h3><p>{counts?.channels ?? 0}</p></div>
                <div className="card"><h3>السلاسل</h3><p>{counts?.series ?? 0}</p></div>
                <div className="card"><h3>الفيديوهات</h3><p>{counts?.videos ?? 0}</p></div>
                <div className="card"><h3>المنشور</h3><p>{counts?.published ?? 0}</p></div>
              </div>
              <div className="actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                <Link className="btn btn-primary" href="/dashboard/channels/">ربط القنوات</Link>
                <Link className="btn btn-ghost" href="/dashboard/series/">إدارة السلاسل</Link>
                <Link className="btn btn-ghost" href="/dashboard/assets/">الأصول</Link>
                <Link className="btn btn-ghost" href="/dashboard/admin/">لوحة الإدارة</Link>
                <Link className="btn btn-ghost" href="/dashboard/billing/">Billing</Link>
                {counts?.firstSeriesId && <Link className="btn btn-ghost" href={`/dashboard/series/detail/?id=${counts.firstSeriesId}`}>أكمل آخر سلسلة</Link>}
              </div>
            </>
          )}
          {currentMembership && (
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 16 }}>
              دورك في هذه المساحة: <strong>{currentMembership.role}</strong>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
