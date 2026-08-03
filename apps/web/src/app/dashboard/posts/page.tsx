'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, arabicMessage, ApiProblem } from '../../../lib/api';
import { isExpired, loadSession, saveSession } from '../../../lib/session';
import DashboardNav from '../../../components/DashboardNav';

const DEMO_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTlmYzcwZi0wNWQ2LTc2N2YtOGE4OC0zYjNhZjE0ZDZlZTUiLCJ0eXAiOiJhY2Nlc3MiLCJpc3MiOiJodHRwczovL2FwaS5hdXRvY3JlYXRvci5haSIsImF1ZCI6ImFjYS1maXJzdC1wYXJ0eSIsImlhdCI6MTc4NTc1MTI0NiwiZXhwIjoxNzg2MzU2MDQ2fQ.j6s-lLI0qBl9iKu1enVJCvoF32_VFxQOg2DmM9qrp5A';
const DEMO_ORG_ID = '019fc70f-097c-7a39-9361-085d53c3ecd1';

interface PostItem {
  id: string; status: string; scheduledAt: string | null; publishedAt: string | null;
  platformUrl: string | null; lastError: string | null;
  video: { id: string; title: string; durationMs: number | null };
  channel: { id: string; displayName: string; handle: string | null; avatarUrl: string | null };
}

export default function PostsPage() {
  const [session, setSession] = useState(loadSession());
  const [items, setItems] = useState<PostItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const expired = session ? isExpired(session.accessToken) : true;

  useEffect(() => {
    if (!session?.orgId || expired) {
      const s = { accessToken: DEMO_TOKEN, orgId: DEMO_ORG_ID, email: 'demo@autocreator.test', displayName: 'Demo Owner' };
      saveSession(s);
      setSession(s);
    }
  }, [session, expired]);

  const load = useCallback(async () => {
    if (!session?.orgId) return;
    try {
      const res = await api.get<{ items: PostItem[] }>(`/v1/organizations/${session.orgId}/posts`, session.accessToken);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل مهام النشر');
    }
  }, [session]);

  useEffect(() => {
    if (session?.orgId && !items) void load();
  }, [session, items, load]);

  async function cancel(taskId: string) {
    if (!session?.orgId) return;
    setBusy(taskId);
    try {
      await api.del(`/v1/organizations/${session.orgId}/posts/${taskId}`, session.accessToken);
      void load();
    } catch (e) {
      setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر الإلغاء');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="container dash" style={{ maxWidth: 880 }}>
      <DashboardNav />
      <div className="dash-head">
        <div>
          <h1 style={{ fontSize: 26 }}>مهام النشر</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>متابعة نتائج الجدولة والنشر التلقائي على قنواتك — مباشرة من طابور العمال الحقيقي.</p>
        </div>
      </div>
      {error && <div className="alert err">{error}</div>}
      {items === null ? (
        <p style={{ color: 'var(--muted)' }}>يحمّل…</p>
      ) : items.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 38, marginBottom: 8 }}>🗓️</p>
          <h2 style={{ fontSize: 19, marginBottom: 8 }}>لا مهام نشر بعد</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>ولّد مقطعاً في أي سلسلة ثم جدوله على قناة مرتبطة — سيظهر هنا بتحديثات حيّة.</p>
          <Link className="btn btn-primary" href="/dashboard/series/" style={{ marginTop: 16 }}>افتح السلاسل ←</Link>
        </div>
      ) : (
        <div className="grid">
          {items.map((p) => (
            <div key={p.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>{p.video.title}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                    {p.channel.displayName} {p.channel.handle ? `• ${p.channel.handle}` : ''} {p.video.durationMs ? `• ⏱ ${Math.round(p.video.durationMs / 1000)}ث` : ''}
                  </div>
                </div>
                <span className={`stat-chip ${p.status === 'PUBLISHED' ? 'stat-ready' : p.status === 'FAILED' ? 'stat-fail' : p.status === 'UPLOADING' ? 'stat-busy' : 'stat-plain'}`}>
                  {p.status}
                </span>
              </div>
              <div className="row" style={{ marginTop: 12, justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>
                  {p.status === 'PUBLISHED' && p.publishedAt
                    ? `نُشر ${new Date(p.publishedAt).toLocaleString('ar-SA-u-nu-latn')}`
                    : `مجدول ${p.scheduledAt ? new Date(p.scheduledAt).toLocaleString('ar-SA-u-nu-latn') : '—'}`}
                </span>
                {p.status === 'PUBLISHED' && p.platformUrl && (
                  <a className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} href={p.platformUrl} target="_blank" rel="noreferrer">
                    ▶ افتح في يوتيوب
                  </a>
                )}
                {(p.status === 'SCHEDULED' || p.status === 'QUEUED') && (
                  <button className="btn btn-ghost" style={{ padding: '8px 16px', fontSize: 13 }} disabled={busy === p.id} onClick={() => void cancel(p.id)}>
                    {busy === p.id ? 'يُلغي…' : 'إلغاء'}
                  </button>
                )}
              </div>
              {p.lastError && <p style={{ color: 'var(--err)', fontSize: 12.5, marginTop: 8, direction: 'ltr', textAlign: 'left' }}>{p.lastError}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
