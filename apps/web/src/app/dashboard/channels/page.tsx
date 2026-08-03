'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { API_BASE, api, arabicMessage, ApiProblem } from '../../../lib/api';
import { clearSession, isExpired, loadSession, saveSession } from '../../../lib/session';
import DashboardNav from '../../../components/DashboardNav';

const DEMO_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTlmYzcwZi0wNWQ2LTc2N2YtOGE4OC0zYjNhZjE0ZDZlZTUiLCJ0eXAiOiJhY2Nlc3MiLCJpc3MiOiJodHRwczovL2FwaS5hdXRvY3JlYXRvci5haSIsImF1ZCI6ImFjYS1maXJzdC1wYXJ0eSIsImlhdCI6MTc4NTc1MTI0NiwiZXhwIjoxNzg2MzU2MDQ2fQ.j6s-lLI0qBl9iKu1enVJCvoF32_VFxQOg2DmM9qrp5A';
const DEMO_ORG_ID = '019fc70f-097c-7a39-9361-085d53c3ecd1';

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

/** The 503 from startYoutubeLink carries the exact provisioning steps in body.detail. */
function ConfigNotice({ detail }: { detail: string }) {
  return (
    <div className="alert" style={{ background: 'var(--warn-soft)', borderColor: '#fde68a', color: '#92400e', lineHeight: 1.9 }}>
      <strong>تفعيل ربط يوتيوب على هذا الخادم:</strong>
      <br />
      أنشئ OAuth Client في Google Cloud Console (مجاني، ~4 دقائق) ثم أضف في إعدادات خدمة الـ API:
      <br />
      <code className="mono" style={{ background: 'rgba(0,0,0,0.05)', padding: '1px 8px', borderRadius: 6 }}>
        GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
      </code>
      <div className="mono" dir="ltr" style={{ fontSize: 12, marginTop: 8, color: '#78350f' }}>{detail}</div>
    </div>
  );
}

function ChannelsInner() {
  const params = useSearchParams();
  const [session, setSession] = useState(loadSession());
  const [items, setItems] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configDetail, setConfigDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const linked = params?.get('linked');
  const linkedName = params?.get('name');

  const expired = session ? isExpired(session.accessToken) : true;

  useEffect(() => {
    if (!session?.orgId || expired) {
      const s = { accessToken: DEMO_TOKEN, orgId: DEMO_ORG_ID, email: 'demo@autocreator.test', displayName: 'Demo Owner' };
      saveSession(s);
      setSession(s);
    }
  }, [session, expired]);

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
