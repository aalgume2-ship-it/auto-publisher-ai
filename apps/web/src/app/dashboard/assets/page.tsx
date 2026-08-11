'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderSearch, Tags, UploadCloud } from 'lucide-react';
import AppShell from '../../../components/dashboard/app-shell';
import { EmptyState, GlassCard, SectionHeader } from '../../../components/ui/chrome';
import { HoverLift, Reveal } from '../../../components/ui/reveal';
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

  const accept = useMemo(() => (kind === 'VIDEO_CLIP' ? 'video/*' : kind === 'AUDIO' ? 'audio/*' : 'image/*'), [kind]);

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
        await api.post(`/v1/organizations/${session.orgId}/assets/upload`, {
          fileName: file.name,
          mimeType: file.type || guessMime(file.name),
          kind,
          folder: folder.trim() || undefined,
          tags: tagList,
          base64,
        }, session.accessToken);
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
      await api.patch(`/v1/organizations/${session.orgId}/assets/${item.id}`, {
        folder: (folderDrafts[item.id] ?? item.folder ?? '').trim() || null,
        tags: splitTags(tagDrafts[item.id] ?? item.tags.join(', ')),
      }, session.accessToken);
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

  if (!ready || !session) return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;

  return (
    <AppShell session={session} title="Asset Library" subtitle="Organize visual and media inputs with search, folders, tags and premium browsing.">
      {error && <div className="alert err">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <Reveal>
        <GlassCard>
          <SectionHeader eyebrow="Ingest" title="Upload and structure your library." body="Built for large collections: multi-file intake, folder taxonomy, tags and search-first browsing." action={<label className="btn btn-primary"><UploadCloud size={18} /> {busy ? 'Uploading…' : 'Upload files'}<input type="file" multiple accept={accept} style={{ display: 'none' }} onChange={upload} disabled={busy} /></label>} />
          <div className="section-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            <div className="field" style={{ marginBottom: 0 }}><label>Type</label><select value={kind} onChange={(e) => setKind(e.target.value as AssetItem['kind'])}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Folder</label><input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="campaign / brand / product" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Tags</label><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hero, launch, social" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Search query</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="File, folder or tag" /></div>
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <span className="stat-chip stat-plain"><FolderSearch size={14} /> Filter by folder</span>
            <input style={{ maxWidth: 280 }} value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="Tag filter" />
            <button className="btn btn-ghost" onClick={() => void load()}>Refresh results</button>
          </div>
        </GlassCard>
      </Reveal>

      {items.length === 0 ? (
        <EmptyState title="No assets found" body="No media matched the current filters. Upload fresh files or broaden the search criteria." />
      ) : (
        <div className="media-grid">
          {items.map((item, index) => (
            <Reveal key={item.id} delay={index * 0.03}>
              <HoverLift>
                <div className="glass-card video-card">
                  <div className="poster-wrap">
                    {item.url && (item.kind === 'IMAGE' || item.kind === 'BRAND') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="poster" src={`${API_BASE}${item.url}`} alt={item.fileName} />
                    ) : item.url && item.kind === 'VIDEO_CLIP' ? (
                      <video className="player" src={`${API_BASE}${item.url}`} controls preload="metadata" />
                    ) : (
                      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)', fontSize: 42 }}>{item.kind === 'AUDIO' ? '🎧' : '📁'}</div>
                    )}
                  </div>
                  <div className="meta">
                    <div className="title">{item.fileName}</div>
                    <div className="row" style={{ marginTop: 10 }}>
                      <span className="stat-chip stat-plain">{item.kind}</span>
                      <span className="stat-chip stat-plain">{formatBytes(Number(item.bytes))}</span>
                      {item.folder && <span className="stat-chip stat-busy">{item.folder}</span>}
                    </div>
                    {item.tags.length > 0 && <div className="row" style={{ marginTop: 10 }}>{item.tags.map((tag) => <span key={tag} className="stat-chip stat-ready"><Tags size={12} /> {tag}</span>)}</div>}
                    <div className="field" style={{ marginTop: 14 }}><label>Folder</label><input value={folderDrafts[item.id] ?? item.folder ?? ''} onChange={(e) => setFolderDrafts((cur) => ({ ...cur, [item.id]: e.target.value }))} /></div>
                    <div className="field"><label>Tags</label><input value={tagDrafts[item.id] ?? item.tags.join(', ')} onChange={(e) => setTagDrafts((cur) => ({ ...cur, [item.id]: e.target.value }))} /></div>
                    <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
                      {item.url ? <a className="btn btn-ghost" href={`${API_BASE}${item.url}`} target="_blank" rel="noreferrer">Open</a> : <span />}
                      <div className="row">
                        <button className="btn btn-ghost" onClick={() => void saveMeta(item)} disabled={saving === item.id}>{saving === item.id ? 'Saving…' : 'Save'}</button>
                        <button className="btn btn-ghost" onClick={() => void remove(item.id)} disabled={deleting === item.id}>{deleting === item.id ? 'Deleting…' : 'Delete'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              </HoverLift>
            </Reveal>
          ))}
        </div>
      )}
    </AppShell>
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
      const result = typeof reader.result === 'string' ? reader.result : '';
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
