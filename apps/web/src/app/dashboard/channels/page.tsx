'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { API_BASE, api, arabicMessage, ApiProblem } from '../../../lib/api';
import DashboardNav from '../../../components/DashboardNav';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

interface Channel {
  id: string;
  platform: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  status: string;
  followers: string | null;
  connectedAt: string;
}

/** The 503 from startYoutubeLink carries the exact activation steps in body.detail. */
function ConfigNotice({ detail }: { detail: string }) {
  return (
    <div className="alert" style={{ background: 'var(--warn-soft)', borderColor: '#fde68a', color: '#92400e', lineHeight: 1.9 }}>
      <strong>ربط يوتيوب غير مفعّل بعد لهذه المنظمة.</strong>
      <br />
      فعّله ذاتياً خلال ~٤ دقائق من{' '}
      <Link href="/dashboard/settings/" style={{ color: '#78350f', fontWeight: 800, textDecoration: 'underline' }}>
        صفحة الإعدادات ← عميل Google OAuth
      </Link>{' '}
      (مجاني — نتحقق منه لدى Google قبل الحفظ).
      <div className="mono" dir="ltr" style={{ fontSize: 12, marginTop: 8, color: '#78350f' }}>{detail}</div>
    </div>
  );
}

function ChannelsInner() {
  const params = useSearchParams();
  const { session, ready } = useAuthenticatedSession();
  const [items, setItems] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configDetail, setConfigDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const linked = params?.get('linked');
  const linkedName = params?.get('name');

  const load = useCallback(async (s: NonNullable<typeof session>) => {
    try {
      const res = await api.get<{ items: Channel[] }>(`/v1/organizations/${s.orgId}/channels`, s.accessToken);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل القنوات');
    }
  }, []);

  useEffect(() => {
    if (session?.orgId && !items) void load(session);
  }, [session, items, load]);

  async function link() {
    if (!session?.orgId) return;
    setBusy('link');
    setError(null);
    setConfigDetail(null);
    try {
      const res = await api.post<{ authorizeUrl: string }>(`/v1/organizations/${session.orgId}/channels/youtube/link`, {}, session.accessToken);
      window.location.href = res.authorizeUrl; // → Google consent (real)
    } catch (e) {
      if (e instanceof ApiProblem && e.status === 503) {
        setConfigDetail(e.body.detail ?? 'YouTube OAuth client is not configured on this server yet.');
      } else {
        setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر بدء الربط');
      }
      setBusy(null);
    }
  }

  async function disconnect(id: string) {
    if (!session?.orgId) return;
    setBusy(id);
    try {
      await api.del(`/v1/organizations/${session.orgId}/channels/${id}`, session.accessToken);
      setItems((arr) => (arr ?? []).filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر فصل القناة');
    } finally {
      setBusy(null);
    }
  }

  if (!ready || !session) {
    return <div className="container dash"><p style={{ color: 'var(--muted)' }}>يتم التحقق من الجلسة…</p></div>;
  }

  if (!session.orgId) {
    return <div className="container dash"><DashboardNav /><div className="panel"><p style={{ color: 'var(--muted)' }}>اختر Workspace من الصفحة الرئيسية أولاً.</p></div></div>;
  }

  return (
    <div className="container dash" style={{ maxWidth: 880 }}>
      <DashboardNav />
      <div className="dash-head">
        <div>
          <h1 style={{ fontSize: 26 }}>القنوات المرتبطة</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>اربط قنوات YouTube بنقرة واحدة عبر OAuth — تُخزَّن الرموز مشفّرة (AES-256-GCM) في الخزنة.</p>
        </div>
        <button className="btn btn-primary" onClick={link} disabled={busy === 'link'}>
          {busy === 'link' ? 'يفتح Google…' : '🔴 ربط قناة YouTube'}
        </button>
      </div>

      {linked && (
        <div className="alert ok" style={{ marginBottom: 18 }}>
          ✓ تم ربط القناة{linkedName ? ` «${linkedName}»` : ''} بنجاح — جاهزة للنشر التلقائي.
        </div>
      )}
      {configDetail && <ConfigNotice detail={configDetail} />}
      {error && <div className="alert err">{error}</div>}

      {items === null ? (
        <p style={{ color: 'var(--muted)' }}>يحمّل القنوات…</p>
      ) : items.length === 0 && !configDetail ? (
        <div className="panel" style={{ textAlign: 'center', padding: 44 }}>
          <p style={{ fontSize: 40, marginBottom: 8 }}>📺</p>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>لا قنوات بعد</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 18 }}>اربط قناتك الأولى لتفعيل النشر التلقائي عليها.</p>
          <button className="btn btn-primary" onClick={link} disabled={busy === 'link'}>
            {busy === 'link' ? 'يفتح Google…' : '🔴 ربط قناة YouTube'}
          </button>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {(items ?? []).map((c) => (
            <div key={c.id} className="card">
              <div className="row" style={{ gap: 12 }}>
                {c.avatarUrl && <img src={c.avatarUrl} alt="" width={44} height={44} style={{ borderRadius: '50%' }} />}
                <div>
                  <div style={{ fontWeight: 800 }}>{c.displayName}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>{c.handle ?? c.platform}</div>
                </div>
              </div>
              <div className="row" style={{ marginTop: 14, gap: 8 }}>
                <span className="stat-chip stat-ready">{c.status === 'CONNECTED' ? '● متصلة' : c.status}</span>
                {c.followers && <span className="stat-chip stat-plain">👥 {Number(c.followers).toLocaleString('ar-SA')}</span>}
              </div>
              <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>رُبطت {new Date(c.connectedAt).toLocaleDateString('ar-SA-u-nu-latn')}</span>
                <button className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => void disconnect(c.id)} disabled={busy === c.id}>
                  {busy === c.id ? 'يفصل…' : 'فصل'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: 22, color: 'var(--muted)', fontSize: 13 }}>
        الخطوة التالية بعد الربط:{' '}
        <Link href="/dashboard/series/" style={{ color: 'var(--brand-strong)', fontWeight: 700 }}>
          أنشئ سلسلة وفعّل النشر التلقائي ←
        </Link>
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="container dash" style={{ maxWidth: 880 }}><p style={{ color: 'var(--muted)', paddingTop: 40 }}>يحمّل…</p></div>}>
      <ChannelsInner />
    </Suspense>
  );
}
