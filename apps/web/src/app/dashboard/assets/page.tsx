'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardNav from '../../../components/DashboardNav';
import { API_BASE, ApiProblem, api, arabicMessage } from '../../../lib/api';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

interface AssetItem {
  id: string;
  kind: 'IMAGE' | 'VIDEO_CLIP' | 'AUDIO' | 'BRAND';
  mimeType: string;
  fileName: string;
  bytes: string;
  url: string;
  createdAt: string;
}

const KINDS: Array<AssetItem['kind']> = ['IMAGE', 'VIDEO_CLIP', 'AUDIO', 'BRAND'];

export default function AssetsPage() {
  const { session, ready } = useAuthenticatedSession();
  const [items, setItems] = useState<AssetItem[]>([]);
  const [kind, setKind] = useState<AssetItem['kind']>('IMAGE');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.orgId || !session.accessToken) return;
    const q = kind ? `?kind=${kind}` : '';
    const res = await api.get<{ items: AssetItem[] }>(`/v1/organizations/${session.orgId}/assets${q}`, session.accessToken);
    setItems(res.items);
  }, [session, kind]);

  useEffect(() => {
    if (!ready || !session?.orgId) return;
    void load().catch((e) => setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل الأصول'));
  }, [ready, session, load]);

  const accept = useMemo(() => {
    if (kind === 'VIDEO_CLIP') return 'video/*';
    if (kind === 'AUDIO') return 'audio/*';
    return 'image/*';
  }, [kind]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !session?.orgId || !session.accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const base64 = await fileToBase64(file);
      await api.post(
        `/v1/organizations/${session.orgId}/assets/upload`,
        { fileName: file.name, mimeType: file.type || guessMime(file.name), kind, base64 },
        session.accessToken,
      );
      setNotice('تم رفع الأصل بنجاح إلى التخزين الدائم.');
      e.target.value = '';
      await load();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر رفع الملف');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!session?.orgId || !session.accessToken) return;
    setDeleting(id);
    setError(null);
    try {
      await api.del(`/v1/organizations/${session.orgId}/assets/${id}`, session.accessToken);
      setItems((cur) => cur.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر حذف الأصل');
    } finally {
      setDeleting(null);
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
          <h1 style={{ fontSize: 26 }}>مكتبة الأصول</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>رفع صور وفيديوهات وصوتيات إلى التخزين الدائم داخل مساحة العمل الحالية.</p>
        </div>
      </div>

      {error && <div className="alert err">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="row" style={{ alignItems: 'end' }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="kind">نوع الأصل</label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as AssetItem['kind'])}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <label className="btn btn-primary" style={{ marginBottom: 0 }}>
            {busy ? 'يرفع…' : 'رفع ملف'}
            <input type="file" accept={accept} style={{ display: 'none' }} onChange={upload} disabled={busy} />
          </label>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>
          الحد الحالي لكل ملف عبر هذه الواجهة: 25MB. الملفات تُخزَّن في التخزين الدائم ويمكن استخدامها في العلامة التجارية أو المراجعة اليدوية.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>لا توجد أصول من هذا النوع بعد.</p>
        </div>
      ) : (
        <div className="media-grid">
          {items.map((item) => (
            <div key={item.id} className="card video-card">
              <div className="poster-wrap" style={{ background: '#f8fafc' }}>
                {item.kind === 'IMAGE' || item.kind === 'BRAND' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="poster" src={`${API_BASE}${item.url}`} alt={item.fileName} />
                ) : item.kind === 'VIDEO_CLIP' ? (
                  <video className="player" src={`${API_BASE}${item.url}`} controls preload="metadata" />
                ) : (
                  <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#64748b', fontSize: 42 }}>🎧</div>
                )}
              </div>
              <div className="meta">
                <div className="title">{item.fileName}</div>
                <div className="row" style={{ marginTop: 8, gap: 6 }}>
                  <span className="stat-chip stat-plain">{item.kind}</span>
                  <span className="stat-chip stat-plain">{formatBytes(Number(item.bytes))}</span>
                </div>
                <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
                  <a className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} href={`${API_BASE}${item.url}`} target="_blank" rel="noreferrer">
                    فتح/تنزيل
                  </a>
                  <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => void remove(item.id)} disabled={deleting === item.id}>
                    {deleting === item.id ? 'يحذف…' : 'حذف'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('file-read-failed'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64 ?? '');
    };
    reader.readAsDataURL(file);
  });
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
