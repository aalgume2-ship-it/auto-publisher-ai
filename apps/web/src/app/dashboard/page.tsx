'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, arabicMessage, ApiProblem } from '../../lib/api';
import { clearSession, isExpired, loadSession, patchSession, readClaims, saveSession } from '../../lib/session';
import StepProgress, { type JourneyStep } from '../../components/StepProgress';
import DashboardNav from '../../components/DashboardNav';

const DEMO_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTlmYzcwZi0wNWQ2LTc2N2YtOGE4OC0zYjNhZjE0ZDZlZTUiLCJ0eXAiOiJhY2Nlc3MiLCJpc3MiOiJodHRwczovL2FwaS5hdXRvY3JlYXRvci5haSIsImF1ZCI6ImFjYS1maXJzdC1wYXJ0eSIsImlhdCI6MTc4NTc1MTI0NiwiZXhwIjoxNzg2MzU2MDQ2fQ.j6s-lLI0qBl9iKu1enVJCvoF32_VFxQOg2DmM9qrp5A';
const DEMO_ORG_ID = '019fc70f-097c-7a39-9361-085d53c3ecd1';

const TIMEZONES = [
  { value: 'Asia/Riyadh', label: 'الرياض (GMT+3)' },
  { value: 'Asia/Dubai', label: 'دبي (GMT+4)' },
  { value: 'Africa/Cairo', label: 'القاهرة (GMT+2)' },
  { value: 'Europe/London', label: 'لندن (GMT+0/+1)' },
  { value: 'UTC', label: 'التوقيت العالمي UTC' },
];

interface OrgDetail {
  id: string; name: string; slug: string; status: string; timezone: string; defaultLocale: string;
  createdAt: string; counts: { members: number; teams: number; departments: number };
}
interface Counts { channels: number; series: number; videos: number; posts: number; published: number; firstSeriesId: string | null }

const JOURNEY_LABELS = [
  'إنشاء الحساب',
  'إنشاء مساحة العمل',
  'ربط قناة يوتيوب',
  'إنشاء أول سلسلة',
  'توليد أول مقطع',
  'الجدولة والنشر التلقائي',
  'متابعة النتائج والتحسين',
  'الطيار الآلي والتوسّع',
] as const;

export default function DashboardPage() {
  const [session, setSession] = useState(loadSession());
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgTz, setNewOrgTz] = useState('Asia/Riyadh');
  const [wizStep, setWizStep] = useState<number | null>(null);

  const expired = session ? isExpired(session.accessToken) : true;

  const loadOrg = useCallback(async (orgId: string, token: string) => {
    const detail = await api.get<OrgDetail>(`/v1/organizations/${orgId}`, token);
    setOrg(detail);
  }, []);

  const loadCounts = useCallback(async (orgId: string, token: string) => {
    try {
      const [c, s, v, p] = await Promise.all([
        api.get<{ items: unknown[] }>(`/v1/organizations/${orgId}/channels`, token),
        api.get<{ items: { id: string }[] }>(`/v1/organizations/${orgId}/series`, token),
        api.get<{ items: unknown[] }>(`/v1/organizations/${orgId}/videos`, token),
        api.get<{ items: { status: string }[] }>(`/v1/organizations/${orgId}/posts`, token),
      ]);
      setCounts({
        channels: c.items.length,
        series: s.items.length,
        videos: v.items.length,
        posts: p.items.length,
        published: p.items.filter((t) => t.status === 'PUBLISHED').length,
        firstSeriesId: s.items[0]?.id ?? null,
      });
    } catch {
      /* counts tiles are best-effort; the wizard still runs */
      setCounts({ channels: 0, series: 0, videos: 0, posts: 0, published: 0, firstSeriesId: null });
    }
  }, []);

  useEffect(() => {
    if (session?.orgId && !expired) {
      if (!org) loadOrg(session.orgId, session.accessToken).catch((e) => setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل المنظمة'));
      if (!counts) void loadCounts(session.orgId, session.accessToken);
    }
  }, [session, expired, org, counts, loadOrg, loadCounts]);

  function useDemoSeat() {
    const s = { accessToken: DEMO_TOKEN, orgId: DEMO_ORG_ID, email: 'demo@autocreator.test', displayName: 'Demo Owner' };
    saveSession(s);
    setSession(s);
    setError(null);
    setOrg(null);
    setCounts(null);
    setWizStep(null);
  }

  function logout() {
    clearSession();
    setSession(null);
    setOrg(null);
    setCounts(null);
    setWizStep(null);
  }

  function goBack() {
    setError(null);
    setWizStep(Math.max(0, (wizStep ?? effectiveIndex) - 1));
  }

  /** Per-step gate: the wizard validates ONLY the fields of the visible step. */
  function attemptNext() {
    setError(null);
    const current = wizStep ?? effectiveIndex;
    if (current === 0) { setWizStep(1); return; }
    if (current === 1) {
      if (org) { setWizStep(2); return; }
      if (newOrgName.trim().length < 2) {
        setError('بعض الحقول غير مكتملة — أدخل اسم مساحة العمل (حرفان على الأقل) للمتابعة.');
        return;
      }
      void createOrg();
      return;
    }
    if (current < 7) setWizStep(current + 1);
  }

  async function createOrg() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<OrgDetail>('/v1/organizations', { name: newOrgName.trim(), timezone: newOrgTz }, session.accessToken);
      patchSession({ orgId: created.id });
      setSession(loadSession());
      setOrg(created);
      setNewOrgName('');
      setWizStep(2);
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر إنشاء مساحة العمل — أعد المحاولة');
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
            <Link className="btn btn-primary" href="/login/">تسجيل الدخول</Link>
            <Link className="btn btn-ghost" href="/register/">حساب جديد</Link>
            <button className="btn btn-ghost" onClick={useDemoSeat}>⚡ تجربة فورية (Demo Org جاهزة)</button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- signed in ---------------- */
  const dones = [
    true,
    Boolean(org),
    (counts?.channels ?? 0) > 0,
    (counts?.series ?? 0) > 0,
    (counts?.videos ?? 0) > 0,
    (counts?.posts ?? 0) > 0,
    (counts?.published ?? 0) > 0,
    false, // autopilot engagement — surfaced per-series (real module, not derivable cheaply here)
  ];
  const effectiveIndex = Math.min(7, dones.findIndex((d) => !d) === -1 ? 7 : dones.findIndex((d) => !d));
  const current = wizStep ?? effectiveIndex;
  const steps: JourneyStep[] = JOURNEY_LABELS.map((label, i) => ({
    key: String(i),
    label,
    state: i === current ? 'current' : i < effectiveIndex ? 'done' : 'upcoming',
  }));
  const claims = readClaims(session.accessToken);

  /** Real per-step destinations — التالي for steps ≥3 navigates to the live module screen. */
  const STEP_LINKS: Record<number, { href: string; cta: string; body: string }> = {
    2: { href: '/dashboard/channels/', cta: '🔴 افتح ربط القنوات ←', body: 'اربط قناة يوتيوب عبر OAuth الآمن — الرموز تُشفَّر في الخزنة وتُحدَّث تلقائياً.' },
    3: { href: '/dashboard/series/', cta: '🎬 افتح السلاسل ←', body: 'كل سلسلة خط إنتاج مستقل بنيتش وكلمات مفتاحية خاصة.' },
    4: { href: counts?.firstSeriesId ? `/dashboard/series/detail/?id=${counts.firstSeriesId}` : '/dashboard/series/', cta: '⚡ افتح التوليد ←', body: 'اكتب الكلمة المفتاحية — المنصة تولّد السيناريو والتعليق الصوتي والمشاهد وتركّب الفيديو تلقائياً.' },
    5: { href: counts?.firstSeriesId ? `/dashboard/series/detail/?id=${counts.firstSeriesId}` : '/dashboard/posts/', cta: '🗓 افتح الجدولة ←', body: 'حدد القناة والموعد — طابور النشر يرفع المقطع إلى يوتيوب تلقائياً في وقته.' },
    6: { href: '/dashboard/posts/', cta: '📊 افتح متابعة النتائج ←', body: 'تتبّع حالات النشر والروابط الحيّة لمقاطعك على يوتيوب من مكان واحد.' },
    7: { href: counts?.firstSeriesId ? `/dashboard/series/detail/?id=${counts.firstSeriesId}` : '/dashboard/series/', cta: '🤖 افتح الطيار الآلي ←', body: 'فعّل الطيار الآلي على سلسلتك: توليد + نشر يومي بالكلمات المفتاحية — قناة تعمل وحدها.' },
  };

  return (
    <div className="container dash" style={{ maxWidth: 880 }}>
      <DashboardNav />
      <div className="dash-head">
        <div>
          <h1 style={{ fontSize: 26 }}>معالج الإطلاق</h1>
          <p style={{ fontSize: 13.5 }} className="mono">{session.email ?? claims.sub ?? ''}</p>
        </div>
        <div className="row">
          <button className="btn btn-ghost" onClick={logout}>خروج</button>
        </div>
      </div>

      <div className="wizard">
        <StepProgress embedded steps={steps} currentIndex={current} />
        <div className="wizard-body">
          {error && <div className="alert err">{error}</div>}

          {current === 0 && (
            <>
              <h2 className="wizard-step-title">١. حسابك — مكتمل ✓</h2>
              <p className="wizard-step-sub">أُنجزت هذه الخطوة لحظة تسجيلك.</p>
              <div className="wizard-done">✓ تم إنشاء الحساب وتفعيل الجلسة بنجاح</div>
              <dl className="kv">
                <dt>البريد الإلكتروني</dt>
                <dd>{session.email ?? '—'}</dd>
              </dl>
            </>
          )}

          {current === 1 &&
            (org ? (
              <>
                <h2 className="wizard-step-title">٢. مساحة العمل — مكتملة ✓</h2>
                <div className="wizard-done">✓ «{org.name}» جاهزة ({org.counts.members} عضو)</div>
                <dl className="kv">
                  <dt>الاسم</dt>
                  <dd>{org.name}</dd>
                  <dt>المعرّف (slug)</dt>
                  <dd>{org.slug}</dd>
                  <dt>المنطقة الزمنية</dt>
                  <dd>{org.timezone}</dd>
                </dl>
              </>
            ) : (
              <>
                <h2 className="wizard-step-title">٢. أنشئ مساحة عملك</h2>
                <p className="wizard-step-sub">حقول هذه الخطوة تخص مساحة العمل فقط: اسمها ومنطقتها الزمنية.</p>
                <form onSubmit={(e) => { e.preventDefault(); attemptNext(); }}>
                  <div className="field">
                    <label htmlFor="orgname">اسم مساحة العمل (Workspace Name)</label>
                    <input id="orgname" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="مثال: قنوات نور الإعلامية" minLength={2} />
                  </div>
                  <div className="field">
                    <label htmlFor="orgtz">المنطقة الزمنية</label>
                    <select id="orgtz" value={newOrgTz} onChange={(e) => setNewOrgTz(e.target.value)}>
                      {TIMEZONES.map((tz) => (<option key={tz.value} value={tz.value}>{tz.label}</option>))}
                    </select>
                  </div>
                </form>
                <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                  مستعجل؟ <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={useDemoSeat}>⚡ افتح Demo Org الجاهزة وتخطَّ هذه الخطوة</button>
                </p>
              </>
            ))}

          {current >= 2 && STEP_LINKS[current] && (
            <>
              <h2 className="wizard-step-title">{['', '', '٣', '٤', '٥', '٦', '٧', '٨'][current]}. {JOURNEY_LABELS[current]}</h2>
              <p className="wizard-step-sub">{STEP_LINKS[current]!.body}</p>
              <Link className="btn btn-primary" href={STEP_LINKS[current]!.href}>{STEP_LINKS[current]!.cta}</Link>
            </>
          )}
        </div>

        <div className="wizard-nav">
          <button className="btn btn-ghost" onClick={goBack} disabled={current === 0}>→ رجوع</button>
          {current >= 2 ? (
            <Link className="btn btn-primary" href={STEP_LINKS[current]?.href ?? '/dashboard/channels/'}>التالي ←</Link>
          ) : (
            <button className="btn btn-primary" onClick={attemptNext} disabled={busy}>
              {busy ? 'جارٍ الإنشاء…' : current === 1 && !org ? 'إنشاء مساحة العمل ←' : 'التالي ←'}
            </button>
          )}
        </div>
      </div>

      {/* -------- live module grid (all navigation, zero gates) -------- */}
      {org && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginTop: 22 }}>
          <Link href="/dashboard/channels/" className="card" style={{ display: 'block' }}>
            <div className="icon">📺</div>
            <h3>القنوات</h3>
            <p>ربط YouTube عبر OAuth بخزنة مشفّرة.</p>
            <p style={{ marginTop: 10 }}><span className="stat-chip stat-plain">{counts?.channels ?? 0} متصلة</span></p>
          </Link>
          <Link href="/dashboard/series/" className="card" style={{ display: 'block' }}>
            <div className="icon">🎬</div>
            <h3>السلاسل والتوليد</h3>
            <p>كلمات مفتاحية → فيديوهات قصيرة جاهزة (نص + صوت + مشاهد + تركيب).</p>
            <p style={{ marginTop: 10 }}><span className="stat-chip stat-plain">{counts?.series ?? 0} سلسلة • {counts?.videos ?? 0} مقطعاً</span></p>
          </Link>
          <Link href="/dashboard/posts/" className="card" style={{ display: 'block' }}>
            <div className="icon">🚀</div>
            <h3>النشر التلقائي</h3>
            <p>جدولة دقيقة ورفع تلقائي إلى يوتيوب مع متابعة حيّة للحالات.</p>
            <p style={{ marginTop: 10 }}><span className="stat-chip stat-plain">{counts?.posts ?? 0} مهمة • {counts?.published ?? 0} منشورة</span></p>
          </Link>
          <div className="card">
            <div className="icon">🏢</div>
            <h3>مساحة العمل</h3>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>الاسم</dt><dd>{org.name}</dd>
              <dt>المعرّف</dt><dd>{org.slug}</dd>
              <dt>الحالة</dt><dd>{org.status}</dd>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
