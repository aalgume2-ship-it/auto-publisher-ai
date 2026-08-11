'use client';

/**
 * Upload — REAL file upload to storage.
 * Accepts MP4 / MOV / WEBM / PNG / JPG / JPEG / WEBP via drag & drop.
 * Flow: presign (S3 PUT) when S3 is configured → direct upload to S3 → asset row;
 * falls back to the durable database tier (base64) when S3 is unconfigured —
 * the UI always shows which tier stored the file, and never claims success
 * before the store actually persisted it.
 */
import { useCallback, useRef, useState } from 'react';
import { CheckCircle2, CloudUpload, FileVideo2, Loader2, UploadCloud } from 'lucide-react';
import AppShell from '../../../components/dashboard/app-shell';
import { api, ApiProblem, arabicMessage } from '../../../lib/api';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

const ACCEPT = ['video/mp4', 'video/quicktime', 'video/webm', 'image/png', 'image/jpeg', 'image/webp'];
const EXT_OK = /\.(mp4|mov|webm|png|jpe?g|webp)$/i;

interface UploadResult {
  id: string;
  fileName: string;
  tier: string;
  bytes: number;
}

export default function UploadPage() {
  const { session, ready } = useAuthenticatedSession();
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [kind, setKind] = useState<'IMAGE' | 'VIDEO_CLIP' | 'AUDIO'>('VIDEO_CLIP');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list);
    const bad = incoming.filter((f) => !EXT_OK.test(f.name) || !ACCEPT.includes(f.type));
    if (bad.length > 0) {
      setError(`Unsupported file type. Accepted: MP4, MOV, WebM, PNG, JPG, JPEG, WEBP (${bad.map((b) => b.name).join(', ')})`);
      return;
    }
    setError(null);
    setFiles((prev) => [...prev, ...incoming].slice(0, 10));
  }, []);

  async function uploadAll() {
    if (!session?.orgId || !session.accessToken || files.length === 0) return;
    setBusy(true);
    setError(null);
    setResults([]);
    const done: UploadResult[] = [];
    try {
      for (const file of files) {
        const mime = file.type || guessMime(file.name);
        const fKind = kindFor(mime);
        // 1) try presigned S3 PUT
        const pre = await api.post<{ tier: 's3' | 'database'; uploadUrl: string | null; storageKey: string | null }>(
          `/v1/organizations/${session.orgId}/uploads/presign`,
          { fileName: file.name, mimeType: mime, kind: fKind, sizeBytes: file.size },
          session.accessToken,
        );
        if (pre.tier === 's3' && pre.uploadUrl) {
          // direct browser → S3
          const put = await fetch(pre.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mime }, body: file });
          if (!put.ok) throw new Error(`S3 upload failed (${put.status})`);
          // confirm + create asset row
          const asset = await api.post<{ id: string }>(`/v1/organizations/${session.orgId}/assets/confirm-s3`, {
            fileName: file.name, mimeType: mime, kind: fKind, storageKey: pre.storageKey, bytes: file.size,
          }, session.accessToken);
          done.push({ id: asset.id, fileName: file.name, tier: 's3', bytes: file.size });
        } else {
          // 2) database tier (base64) — real persistence, tier disclosed
          const b64 = await fileToBase64(file);
          const asset = await api.post<{ id: string }>(`/v1/organizations/${session.orgId}/assets/upload`, {
            fileName: file.name, mimeType: mime, kind: fKind, tags: [], base64: b64,
          }, session.accessToken);
          done.push({ id: asset.id, fileName: file.name, tier: 'database', bytes: file.size });
        }
      }
      setResults(done);
      setFiles([]);
    } catch (e) {
      setError(e instanceof ApiProblem ? (e.body?.detail ?? arabicMessage(e)) : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !session) return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;

  return (
    <AppShell session={session} title="Upload" subtitle="Drag & drop media → storage → database → library (real upload, never fake).">
      {error && <div className="alert err">{error}</div>}
      <div className="glass-card" style={{ padding: 24 }}>
        <div className="row" style={{ gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <span className="sm muted">Upload as:</span>
          {(['VIDEO_CLIP', 'IMAGE', 'AUDIO'] as const).map((k) => (
            <button key={k} className={`btn ${kind === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setKind(k)}>{k.replace('_', ' ')}</button>
          ))}
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#7c5cff' : '#2b3850'}`,
            borderRadius: 16, padding: 48, textAlign: 'center', cursor: 'pointer',
            background: dragging ? 'rgba(124,92,255,0.06)' : 'transparent', transition: 'all .2s',
          }}
        >
          <CloudUpload size={34} style={{ opacity: 0.6, marginBottom: 10 }} />
          <p><strong>Drag & drop</strong> or click to browse</p>
          <p className="sm muted">MP4 · MOV · WebM · PNG · JPG · JPEG · WEBP — up to 10 files</p>
          <input ref={inputRef} type="file" accept=".mp4,.mov,.webm,.png,.jpg,.jpeg,.webp" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        </div>
        {files.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {files.map((f, i) => (
              <div key={i} className="row between glass-panel" style={{ padding: 10 }}>
                <span className="row" style={{ gap: 8 }}><FileVideo2 size={15} /> {f.name} <span className="sm muted">({fmtBytes(f.size)})</span></span>
                <button onClick={() => setFiles(files.filter((_, j) => j !== i))} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }}>×</button>
              </div>
            ))}
            <button className="btn btn-primary" onClick={uploadAll} disabled={busy} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
              {busy ? <Loader2 size={16} className="spin" /> : <UploadCloud size={16} />} Upload {files.length} file{files.length > 1 ? 's' : ''}
            </button>
          </div>
        )}
        {results.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4 className="sm" style={{ marginBottom: 8 }}>Uploaded successfully:</h4>
            {results.map((r) => (
              <div key={r.id} className="row between glass-panel" style={{ padding: 10, marginBottom: 6 }}>
                <span className="row" style={{ gap: 8 }}><CheckCircle2 size={15} color="#4ade80" /> {r.fileName}</span>
                <span className={`chip ${r.tier === 's3' ? 'on' : ''}`}>stored: {r.tier === 's3' ? 'AWS S3' : 'database tier (S3 not configured)'}</span>
              </div>
            ))}
            <p className="sm muted" style={{ marginTop: 8 }}>Files are now in your Library → Uploads.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function kindFor(mime: string): 'IMAGE' | 'VIDEO_CLIP' | 'AUDIO' {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('audio/')) return 'AUDIO';
  return 'VIDEO_CLIP';
}

function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  };
  return map[ext] ?? 'application/octet-stream';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? (r.result.split(',')[1] ?? '') : '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
