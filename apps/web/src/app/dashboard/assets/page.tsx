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
  folder: string | null;
  tags: string[];
  bytes: string;
  url: string | null;
  createdAt: string;
}

const KINDS: Array<AssetItem['kind']> = ['IMAGE', 'VIDEO_CLIP', 'AUDIO', 'BRAND'];

export default function AssetsPage() {
  const { session, ready } = useAuthenticatedSession();
  const [items, setItems] = useState<AssetItem[]>([]);
  const [kind, setKind] = useState<AssetItem['kind']>('IMAGE');
  const [folder, setFolder] = useState('');
  const [tags, setTags] = useState('');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [folderDrafts, setFolderDrafts] = useState<Record<string, string>>({});
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!session?.orgId || !session.accessToken) return;
    const params = new URLSearchParams();
    params.set('kind', kind);
    if (folder.trim()) params.set('folder', folder.trim());
    if (tagFilter.trim()) params.set('tag', tagFilter.trim());
    if (search.trim()) params.set('q', search.trim());
    const res = await api.get<{ items: AssetItem[] }>(`/v1/organizations/${session.orgId}/assets?${params.toString()}`, session.accessToken);
    setItems(res.items);
  }, [session, kind, folder, tagFilter, search]);

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
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !session?.orgId || !session.accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const tagList = splitTags(tags);
      for (const file of files) {
        const base64 = await fileToBase64(file);
        await api.post(
          `/v1/organizations/${session.orgId}/assets/upload`,
          {
            fileName: file.name,
            mimeType: file.type || guessMime(file.name),
            kind,
            folder: folder.trim() || undefined,
            tags: tagList,
            base64,
          },
          session.accessToken,
        );
      }
      setNotice(`تم رفع ${files.length} ملف/ملفات بنجاح إلى التخزين الدائم.`);
      e.target.value = '';
      await load();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر رفع الملفات');
    } finally {
      setBusy(false);
    }
  }

  async function saveMeta(item: AssetItem) {
    if (!session?.orgId || !session.accessToken) return;
    setSaving(item.id);
    setError(null);
    try {
      await api.patch(
        `/v1/organizations/${session.orgId}/assets/${item.id}`,
        {
          folder: (folderDrafts[item.id] ?? item.folder ?? '').trim() || null,
          tags: splitTags(tagDrafts[item.id] ?? item.tags.join(', ')),
        },
        session.accessToken,
      );
      setNotice('تم تحديث تنظيم الأصل.');
      await load();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر تحديث الأصل');
    } finally {
      setSaving(null);
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

  if (!session.orgId) {
    return <div className="container dash"><DashboardNav /><div className="panel"><p style={{ color: 'var(--muted)' }}>اختر Workspace من الصفحة الرئيسية أولاً.</p></div></div>;
  }

  return (
    <div className="container dash" style={{ maxWidth: 1120 }}>
      <DashboardNav />
      <div className="dash-head">
        <div>
          <h1 style={{ fontSize: 26 }}>مكتبة الأصول</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>رفع صور وفيديوهات وصوتيات مع تنظيمها في مجلدات ووسوم والبحث داخلها.</p>
        </div>
      </div>

      {error && <div className="alert err">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="kind">نوع الأصل</label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as AssetItem['kind'])}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="folder">المجلد</label>
            <input id="folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="summer-campaign" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="tags">الوسوم</label>
            <input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="brand, hero, product" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="search">بحث</label>
            <input id="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم الملف أو الوسم" />
          </div>
          <div className="field" style={{ marginBottom: 0, display: 'flex', alignItems: 'end' }}>
            <label className="btn btn-primary" style={{ marginBottom: 0 }}>
              {busy ? 'يرفع…' : 'رفع ملف/ملفات'}
              <input type="file" multiple accept={accept} style={{ display: 'none' }} onChange={upload} disabled={busy} />
            </label>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <input style={{ maxWidth: 260 }} value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="فلتر حسب وسم محدد" />
          <button className="btn btn-ghost" onClick={() => void load()}>تحديث النتائج</button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>
          يدعم الرفع المتعدد. الحد الحالي لكل ملف عبر هذه الواجهة: 25MB. استخدم المجلدات والوسوم لإدارة مئات أو آلاف الملفات داخل الشركة/الحملة.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>لا توجد أصول مطابقة للفلاتر الحالية.</p>
        </div>
      ) : (
        <div className="media-grid">
          {items.map((item) => (
            <div key={item.id} className="card video-card">
              <div className="poster-wrap" style={{ background: '#f8fafc' }}>
                {item.url && (item.kind === 'IMAGE' || item.kind === 'BRAND') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="poster" src={`${API_BASE}${item.url}`} alt={item.fileName} />
                ) : item.url && item.kind === 'VIDEO_CLIP' ? (
                  <video className="player" src={`${API_BASE}${item.url}`} controls preload="metadata" />
                ) : (
                  <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#64748b', fontSize: 42 }}>{item.kind === 'AUDIO' ? '🎧' : '📁'}</div>
                )}
              </div>
              <div className="meta">
                <div className="title">{item.fileName}</div>
                <div className="row" style={{ marginTop: 8, gap: 6 }}>
                  <span className="stat-chip stat-plain">{item.kind}</span>
                  <span className="stat-chip stat-plain">{formatBytes(Number(item.bytes))}</span>
                  {item.folder && <span className="stat-chip stat-plain">📁 {item.folder}</span>}
                </div>
                {item.tags.length > 0 && (
                  <div className="row" style={{ marginTop: 8, gap: 6 }}>
                    {item.tags.map((tag) => <span key={tag} className="stat-chip stat-ready">#{tag}</span>)}
                  </div>
                )}
                <div className="field" style={{ marginTop: 12, marginBottom: 8 }}>
                  <label>المجلد</label>
                  <input value={folderDrafts[item.id] ?? item.folder ?? ''} onChange={(e) => setFolderDrafts((cur) => ({ ...cur, [item.id]: e.target.value }))} />
                </div>
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>الوسوم</label>
                  <input value={tagDrafts[item.id] ?? item.tags.join(', ')} onChange={(e) => setTagDrafts((cur) => ({ ...cur, [item.id]: e.target.value }))} />
                </div>
                <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
                  {item.url ? (
                    <a className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} href={`${API_BASE}${item.url}`} target="_blank" rel="noreferrer">
                      فتح/تنزيل
                    </a>
                  ) : <span />}
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => void saveMeta(item)} disabled={saving === item.id}>
                      {saving === item.id ? 'يحفظ…' : 'حفظ التنظيم'}
                    </button>
                    <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => void remove(item.id)} disabled={deleting === item.id}>
                      {deleting === item.id ? 'يحذف…' : 'حذف'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function splitTags(input: string): string[] {
  return input.split(',').map((tag) => tag.trim()).filter(Boolean);
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
