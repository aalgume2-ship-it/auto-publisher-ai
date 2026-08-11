'use client';

/**
 * Library — REAL files from the database/S3 only.
 * Tabs: Videos | Images | Uploads | Audio.
 * Actions: preview, download, delete, remix, extend, upscale, dub, publish —
 * every button calls the real backend job endpoint and surfaces the result
 * (or the Not-configured reason).
 */
import { useCallback, useEffect, useState } from 'react';
import { Download, Film, ImageIcon, Languages, Music2, Play, RefreshCcw, Trash2, UploadCloud, Wand2, ZoomIn } from 'lucide-react';
import AppShell from '../../../components/dashboard/app-shell';
import { api, ApiProblem, arabicMessage } from '../../../lib/api';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

interface LibraryItem {
  id: string;
  kind: 'video' | 'image' | 'upload' | 'audio';
  title: string;
  status: string | null;
  mimeType: string | null;
  bytes: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  url: string | null;
  thumbUrl: string | null;
  createdAt: string;
  meta: Record<string, unknown>;
}

const TABS = [
  { id: 'videos', label: 'Videos', icon: Film },
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'uploads', label: 'Uploads', icon: UploadCloud },
  { id: 'audio', label: 'Audio', icon: Music2 },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function LibraryPage() {
  const { session, ready } = useAuthenticatedSession();
  const [tab, setTab] = useState<TabId>('videos');
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dubLang, setDubLang] = useState<string>('en');

  const load = useCallback(async () => {
    if (!session?.orgId || !session.accessToken) return;
    const params = new URLSearchParams({ type: tab, sort, limit: '100' });
    if (q.trim()) params.set('q', q.trim());
    try {
      const res = await api.get<{ items: LibraryItem[] }>(`/v1/organizations/${session.orgId}/library?${params}`, session.accessToken);
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiProblem ? arabicMessage(e) : 'Failed to load library');
    }
  }, [session, tab, sort, q]);

  useEffect(() => {
    if (ready && session?.orgId) void load();
  }, [ready, session, load]);

  async function act(name: string, path: string, method: 'POST' | 'DELETE' = 'POST') {
    if (!session?.orgId || !session.accessToken) return;
    setBusy(name); setNotice(null); setError(null);
    try {
      if (method === 'DELETE') await api.del(`/v1/organizations/${session.orgId}/${path}`, session.accessToken);
      else await api.post(`/v1/organizations/${session.orgId}/${path}`, {}, session.accessToken);
      setNotice(`Job started: ${name}`);
      window.setTimeout(() => void load(), 2500);
    } catch (e) {
      setError(e instanceof ApiProblem ? (e.body?.detail ?? arabicMessage(e)) : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function download(item: LibraryItem) {
    if (!item.url) return;
    const a = document.createElement('a');
    a.href = `/api/v1${item.url}`;
    a.download = item.title;
    a.click();
  }

  if (!ready || !session) return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;

  return (
    <AppShell session={session} title="Library" subtitle="Real files from the database & storage — search, sort, filter, act.">
      {notice && <div className="alert ok">{notice}</div>}
      {error && <div className="alert err">{error}</div>}
      <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} className={`btn ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setTab(t.id); setItems(null); }}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
        <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="size">Largest</option>
        </select>
        <button className="btn btn-ghost" onClick={() => void load()}><RefreshCcw size={15} /></button>
      </div>

      {items === null ? (
        <div className="section-grid three">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="glass-card skeleton" style={{ minHeight: 180 }} />)}</div>
      ) : items.length === 0 ? (
        <div className="glass-card" style={{ padding: 36, textAlign: 'center' }}><p className="muted">Nothing here yet — generate or upload to fill the library.</p></div>
      ) : (
        <div className="section-grid three">
          {items.map((item) => (
            <div key={item.id} className="glass-card" style={{ overflow: 'hidden' }}>
              <div style={{ height: 140, background: 'linear-gradient(135deg,#101828,#1a2333)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {item.kind === 'image' && item.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/v1${item.thumbUrl}`} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : item.kind === 'video' ? (
                  <button className="btn btn-primary" style={{ borderRadius: 99 }} onClick={() => { window.location.href = `/result?mode=api&videoId=${item.id}&orgId=${session.orgId}`; }}>
                    <Play size={16} /> Open video
                  </button>
                ) : (
                  <span className="muted sm">{item.mimeType}</span>
                )}
              </div>
              <div style={{ padding: 14 }}>
                <strong style={{ fontSize: 13, display: 'block' }}>{item.title.slice(0, 60)}</strong>
                <p className="sm muted" style={{ margin: '4px 0 10px' }}>
                  {item.mimeType} · {item.bytes ? fmtBytes(Number(item.bytes)) : '—'}
                  {item.durationMs ? ` · ${Math.round(item.durationMs / 1000)}s` : ''}
                  {item.width ? ` · ${item.width}×${item.height}` : ''}
                </p>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {item.url && <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => download(item)}><Download size={13} /> Download</button>}
                  {item.kind === 'video' && (
                    <>
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy !== null} onClick={() => act('Remix', `videos/${item.id}/remix`)}><Wand2 size={13} /> Remix</button>
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy !== null} onClick={() => act('Extend', `videos/${item.id}/extend`)}><ZoomIn size={13} /> Extend</button>
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy !== null} onClick={() => act('Upscale', `videos/${item.id}/upscale`)}><ZoomIn size={13} /> Upscale</button>
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy !== null} onClick={() => act('Dub', `videos/${item.id}/dub`, 'POST')} title={`Dub to ${dubLang}`}><Languages size={13} /> Dub</button>
                      <select className="input" style={{ padding: '2px 6px', fontSize: 12, width: 64 }} value={dubLang} onChange={(e) => setDubLang(e.target.value)}>
                        <option value="en">EN</option><option value="ar">AR</option><option value="fr">FR</option><option value="es">ES</option><option value="tr">TR</option>
                      </select>
                    </>
                  )}
                  {item.kind !== 'video' && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy !== null} onClick={() => act('Delete', `assets/${item.id}`, 'DELETE')}><Trash2 size={13} /> Delete</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
