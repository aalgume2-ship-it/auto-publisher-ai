'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, arabicMessage, ApiProblem } from '../../../lib/api';
import DashboardNav from '../../../components/DashboardNav';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

interface Series {
  id: string;
  name: string;
  niche: string;
  language: string;
  targetPlatforms: string[];
  counts: { videos: number };
  createdAt: string;
}

export default function SeriesPage() {
  const { session, ready } = useAuthenticatedSession();
  const [items, setItems] = useState<Series[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [niche, setNiche] = useState('معرفة وحقائق');

  const load = useCallback(async (s: NonNullable<typeof session>) => {
    try {
      const res = await api.get<{ items: Series[] }>(`/v1/organizations/${s.orgId}/series`, s.accessToken);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل السلاسل');
    }
  }, []);

  useEffect(() => {
    if (session?.orgId && !items) void load(session);
  }, [session, items, load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.orgId) return;
    if (name.trim().length < 2) {
      setError('بعض الحقول غير مكتملة — أدخل اسم السلسلة للمتابعة.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/v1/organizations/${session.orgId}/series`, { name: name.trim(), niche }, session.accessToken);
      setName('');
      setItems(null);
      void load(session);
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر إنشاء السلسلة');
    } finally {
      setBusy(false);
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
          <h1 style={{ fontSize: 26 }}>سلاسل المحتوى</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>كل سلسلة خط إنتاج مستقل: كلمات مفتاحية → توليد تلقائي → نشر على قنواتك.</p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>➕ سلسلة جديدة</h2>
        {error && <div className="alert err">{error}</div>}
        <form onSubmit={create} className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 2, marginBottom: 0 }}>
            <label htmlFor="sname">اسم السلسلة</label>
            <input id="sname" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: حقائق لا تعرفها" minLength={2} />
          </div>
          <div className="field" style={{ flex: 1.4, marginBottom: 0 }}>
            <label htmlFor="sniche">النيتش</label>
            <select id="sniche" value={niche} onChange={(e) => setNiche(e.target.value)}>
              <option>معرفة وحقائق</option>
              <option>تقنية وذكاء اصطناعي</option>
              <option>تحفيز وتطوير ذات</option>
              <option>مال وأعمال</option>
              <option>صحة ولياقة</option>
              <option>تاريخ وحضارات</option>
            </select>
          </div>
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? 'ينشئ…' : 'إنشاء السلسلة ←'}
          </button>
        </form>
      </div>

      {items === null ? (
        <p style={{ color: 'var(--muted)' }}>يحمّل السلاسل…</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>لا سلاسل بعد — أنشئ أول واحدة بالأعلى، ثم ولّد أول مقطع داخلها.</p>
      ) : (
        <div className="media-grid">
          {items.map((s) => (
            <Link key={s.id} href={`/dashboard/series/detail/?id=${s.id}`} className="card" style={{ display: 'block' }}>
              <h3 style={{ marginBottom: 6 }}>🎬 {s.name}</h3>
              <p style={{ fontSize: 13 }}>
                {s.niche} • {s.language}
              </p>
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <span className="stat-chip stat-plain">🎞 {s.counts.videos} مقطعاً</span>
                {s.targetPlatforms.includes('youtube') && <span className="stat-chip stat-plain">🔴 YouTube</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
