'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, arabicMessage, ApiProblem } from '../../lib/api';
import { clearSession, isExpired, loadSession, patchSession, readClaims, saveSession } from '../../lib/session';
import StepProgress, { type JourneyStep } from '../../components/StepProgress';

/** Preview demo seat (public sandbox org, seeded daily tasks) — rotates periodically; preview-only by design. */
const DEMO_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTlmYzcwZi0wNWQ2LTc2N2YtOGE4OC0zYjNhZjE0ZDZlZTUiLCJ0eXAiOiJhY2Nlc3MiLCJpc3MiOiJodHRwczovL2FwaS5hdXRvY3JlYXRvci5haSIsImF1ZCI6ImFjYS1maXJzdC1wYXJ0eSIsImlhdCI6MTc4NTc1MTI0NiwiZXhwIjoxNzg2MzU2MDQ2fQ.j6s-lLI0qBl9iKu1enVJCvoF32_VFxQOg2DmM9qrp5A';
const DEMO_ORG_ID = '019fc70f-097c-7a39-9361-085d53c3ecd1';

/** Timezones offered in the workspace step — the picked value is sent
 * verbatim to POST /v1/organizations (Asia/Riyadh default, IANA names). */
const TIMEZONES = [
  { value: 'Asia/Riyadh', label: 'الرياض (GMT+3)' },
  { value: 'Asia/Dubai', label: 'دبي (GMT+4)' },
  { value: 'Africa/Cairo', label: 'القاهرة (GMT+2)' },
  { value: 'Europe/London', label: 'لندن (GMT+0/+1)' },
  { value: 'UTC', label: 'التوقيت العالمي UTC' },
];

/** The 8-step launch journey. Steps 1–3 are navigable in the wizard; 4–8
 * unlock as their modules ship (channels → series → pipeline → scheduling …). */
const JOURNEY: { key: string; label: string }[] = [
  { key: 'account', label: 'إنشاء الحساب' },
  { key: 'workspace', label: 'إنشاء مساحة العمل' },
  { key: 'channel', label: 'ربط قناة يوتيوب' },
  { key: 'series', label: 'إنشاء أول سلسلة' },
  { key: 'generate', label: 'توليد المقاطع بالذكاء الاصطناعي' },
  { key: 'schedule', label: 'الجدولة والنشر التلقائي' },
  { key: 'analytics', label: 'تحليلات وتحسين مستمر' },
  { key: 'scale', label: 'التوسّع التلقائي للقنوات' },
];
const LAST_REACHABLE = 2; // channels module (next phase) gates everything beyond step 3

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
  const [newOrgTz, setNewOrgTz] = useState('Asia/Riyadh');
  /** null = follow the furthest reachable step automatically. */
  const [wizStep, setWizStep] = useState<number | null>(null);

  const expired = session ? isExpired(session.accessToken) : true;
  /** Furthest step the user has genuinely reached (live data, never stored). */
  const effectiveIndex = org ? 2 : 1;
  /** Step currently on screen. */
  const current = wizStep ?? effectiveIndex;

  const loadOrg = useCallback(async (orgId: string, token: string) => {
    const detail = await api.get<OrgDetail>(`/v1/organizations/${orgId}`, token);
    setOrg(detail);
  }, []);

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
    setWizStep(null); // snap to the furthest reachable step (workspace already exists there)
  }

  function logout() {
    clearSession();
    setSession(null);
    setOrg(null);
    setWizStep(null);
  }

  function goBack() {
    setError(null);
    setWizStep(Math.max(0, current - 1));
  }

  /** Per-step gate for the التالي button: each stage validates ONLY its own
   * fields (workspace stage asks for the workspace name — never a YouTube
   * link — so the validation error matches the visible form exactly). */
  function attemptNext() {
    setError(null);
    if (current === 0) {
      setWizStep(1);
      return;
    }
    if (current === 1) {
      if (org) {
        setWizStep(2);
        return;
      }
      if (newOrgName.trim().length < 2) {
        setError('بعض الحقول غير مكتملة — أدخل اسم مساحة العمل (حرفان على الأقل) للمتابعة.');
        return;
      }
      void createOrg();
      return;
    }
    // current === 2: التالي stays disabled until the channels module ships.
  }

  async function createOrg() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<OrgDetail>(
        '/v1/organizations',
        { name: newOrgName.trim(), timezone: newOrgTz },
        session.accessToken,
      );
      patchSession({ orgId: created.id });
      setSession(loadSession());
      setOrg(created);
      setNewOrgName('');
      setWizStep(2); // advance the wizard once the workspace truly exists
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

  /* ---------------- signed in: setup wizard ---------------- */
  const steps: JourneyStep[] = JOURNEY.map((s, i) => ({
    ...s,
    state: i === current ? 'current' : i < effectiveIndex ? 'done' : 'upcoming',
  }));
  const claims = readClaims(session.accessToken);

  return (
    <div className="container dash" style={{ maxWidth: 880 }}>
      <div className="dash-head">
        <div>
          <h1 style={{ fontSize: 26 }}>إعداد قناتك — معالج الإطلاق</h1>
          <p style={{ fontSize: 13.5 }} className="mono">
            {session.email ?? claims.sub ?? ''}
          </p>
        </div>
        <div className="row">
          <button className="btn btn-ghost" onClick={logout}>
            خروج
          </button>
        </div>
      </div>

      <div className="wizard">
        <StepProgress
          embedded
          steps={steps}
          currentIndex={current}
          hint={current > LAST_REACHABLE ? undefined : current === 2 ? 'تتقدّم الخطوات من اليمين إلى اليسار — خطوتك الحالية مضاءة بالبنفسجي.' : undefined}
        />

        <div className="wizard-body">
          {error && <div className="alert err">{error}</div>}

          {/* -------- step 1 · account -------- */}
          {current === 0 && (
            <>
              <h2 className="wizard-step-title">١. حسابك — مكتمل ✓</h2>
              <p className="wizard-step-sub">هذه الخطوة أُنجزت لحظة تسجيلك. راجع بياناتك ثم تابع إلى مساحة العمل.</p>
              <div className="wizard-done">✓ تم إنشاء الحساب وتفعيل الجلسة بنجاح</div>
              <dl className="kv">
                <dt>البريد الإلكتروني</dt>
                <dd>{session.email ?? '—'}</dd>
                <dt>معرّف المستخدم</dt>
                <dd>{claims.sub ?? '—'}</dd>
              </dl>
            </>
          )}

          {/* -------- step 2 · workspace (its OWN fields only) -------- */}
          {current === 1 &&
            (org ? (
              <>
                <h2 className="wizard-step-title">٢. مساحة العمل — مكتملة ✓</h2>
                <p className="wizard-step-sub">أُنشئت مساحة عملك فعلياً على الخادم. هذه بياناتها الحيّة:</p>
                <div className="wizard-done">✓ «{org.name}» جاهزة ({org.counts.members} عضو)</div>
                <dl className="kv">
                  <dt>الاسم</dt>
                  <dd>{org.name}</dd>
                  <dt>المعرّف (slug)</dt>
                  <dd>{org.slug}</dd>
                  <dt>المنطقة الزمنية</dt>
                  <dd>{org.timezone}</dd>
                  <dt>أُنشئت</dt>
                  <dd>{new Date(org.createdAt).toLocaleDateString('ar-SA-u-nu-latn')}</dd>
                </dl>
              </>
            ) : (
              <>
                <h2 className="wizard-step-title">٢. أنشئ مساحة عملك</h2>
                <p className="wizard-step-sub">حقول هذه الخطوة تخص مساحة العمل فقط: اسمها ومنطقتها الزمنية — لا حقول لأي منصة هنا.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    attemptNext();
                  }}
                >
                  <div className="field">
                    <label htmlFor="orgname">اسم مساحة العمل (Workspace Name)</label>
                    <input
                      id="orgname"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      placeholder="مثال: قنوات نور الإعلامية"
                      minLength={2}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="orgtz">المنطقة الزمنية</label>
                    <select id="orgtz" value={newOrgTz} onChange={(e) => setNewOrgTz(e.target.value)}>
                      {TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </form>
                <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                  مستعجل؟{' '}
                  <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={useDemoSeat}>
                    ⚡ افتح Demo Org الجاهزة وتخطَّ هذه الخطوة
                  </button>
                </p>
              </>
            ))}

          {/* -------- step 3 · YouTube channel (shows its field, locked honestly) -------- */}
          {current === 2 && (
            <>
              <h2 className="wizard-step-title">٣. اربط قناة يوتيوب</h2>
              <p className="wizard-step-sub">
                هنا سيظهر زر «ربط حساب YouTube» عبر OAuth الآمن + حقل اختيار القناة — وحدة القنوات هي الوحدة القادمة على خارطة الطريق وتُفعَّل بعيداً عن هذه الشاشة اليوم.
              </p>
              <button className="btn btn-primary" disabled title="تُفعَّل مع وحدة ربط القنوات — المرحلة القادمة">
                🔴 ربط حساب YouTube (قريباً)
              </button>
              <span className="badge soon" style={{ marginInlineStart: 10 }}>
                المرحلة القادمة
              </span>
            </>
          )}
        </div>

        <div className="wizard-nav">
          <button className="btn btn-ghost" onClick={goBack} disabled={current === 0}>
            → رجوع
          </button>
          <button
            className="btn btn-primary"
            onClick={attemptNext}
            disabled={busy || current > LAST_REACHABLE || current === 2}
            title={current === 2 ? 'تُفعَّل مع وحدة ربط القنوات — المرحلة القادمة' : undefined}
          >
            {busy ? 'جارٍ الإنشاء…' : current === 1 && !org ? 'إنشاء مساحة العمل ←' : current === 2 ? 'التالي ←' : 'التالي ←'}
          </button>
        </div>
      </div>

      {/* -------- real org telemetry below the wizard -------- */}
      {org && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', marginTop: 22 }}>
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
            </dl>
          </div>
          <div className="card">
            <h3>هيكل المنظمة</h3>
            <div className="row" style={{ marginTop: 14, gap: 18, fontSize: 15, color: '#334155' }}>
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
              ربط قنوات YouTube وخط إنتاج الفيديو هما الوحدة القادمة على خارطة الطريق — ستظهر قنواتك هنا فور الإطلاق.
            </p>
            <span className="badge soon" style={{ marginTop: 10 }}>المرحلة القادمة</span>
          </div>
        </div>
      )}
    </div>
  );
}
