'use client';

/**
 * Image Generation — REAL pipeline:
 * prompt + ref images + style + aspect + resolution + count
 *   → POST /v1/organizations/:orgId/images → BullMQ → worker → provider
 *   → S3/AssetStore → Asset rows → library. Poll until COMPLETED/FAILED.
 * Provider state comes from /providers/status — never a fake success.
 */
import { useCallback, useEffect, useState } from 'react';
import { ImageIcon, Loader2, RefreshCcw, UploadCloud } from 'lucide-react';
import AppShell from '../../../components/dashboard/app-shell';
import { api, ApiProblem, arabicMessage } from '../../../lib/api';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

interface GenJob {
  id: string;
  prompt: string;
  status: string;
  assetIds: string[];
  failureReason: string | null;
  createdAt: string;
}

const ASPECTS = ['9:16', '16:9', '1:1', '4:5'] as const;
const RESOLUTIONS = ['512x512', '720x1280', '1024x1024', '1280x720', '1536x1024'] as const;
const STYLES = ['', 'cinematic', 'photorealistic', '3d render', 'anime', 'watercolor', 'minimalist'] as const;

export default function ImagesPage() {
  const { session, ready } = useAuthenticatedSession();
  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [style, setStyle] = useState<string>('');
  const [aspect, setAspect] = useState<string>('9:16');
  const [resolution, setResolution] = useState<string>('720x1280');
  const [count, setCount] = useState(1);
  const [refImages, setRefImages] = useState<File[]>([]);
  const [jobs, setJobs] = useState<GenJob[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerState, setProviderState] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!session?.orgId || !session.accessToken) return;
    const [j, p] = await Promise.all([
      api.get<{ items: GenJob[] }>(`/v1/organizations/${session.orgId}/images`, session.accessToken).catch(() => ({ items: [] })),
      api.get<{ items: Array<{ id: string; state: string }> }>(`/v1/organizations/${session.orgId}/providers/status`, session.accessToken).catch(() => ({ items: [] })),
    ]);
    setJobs(j.items ?? []);
    const map: Record<string, string> = {};
    for (const it of p.items ?? []) map[it.id] = it.state;
    setProviderState(map);
  }, [session]);

  useEffect(() => {
    if (ready && session?.orgId && jobs === null) void load();
  }, [ready, session, jobs, load]);

  useEffect(() => {
    if (!jobs) return;
    const active = jobs.filter((j) => j.status === 'QUEUED' || j.status === 'PROCESSING');
    if (active.length === 0) return;
    const t = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(t);
  }, [jobs, load]);

  async function generate() {
    if (!session?.orgId || !session.accessToken) return;
    if (prompt.trim().length < 3) { setError('Prompt is required (min 3 characters)'); return; }
    setBusy(true); setError(null);
    try {
      // reference images → upload first (real S3/DB assets)
      const refAssetIds: string[] = [];
      for (const f of refImages) {
        const b64 = await fileToBase64(f);
        const r = await api.post<{ id: string }>(`/v1/organizations/${session.orgId}/assets/upload`, {
          fileName: f.name, mimeType: f.type || 'image/png', kind: 'IMAGE', tags: ['reference'], base64: b64,
        }, session.accessToken);
        refAssetIds.push(r.id);
      }
      const body: Record<string, unknown> = { prompt, count, aspectRatio: aspect, resolution };
      if (negative.trim()) body.negativePrompt = negative.trim();
      if (style) body.style = style;
      if (refAssetIds.length) body.referenceImageIds = refAssetIds;
      await api.post(`/v1/organizations/${session.orgId}/images`, body, session.accessToken);
      setPrompt(''); setRefImages([]);
      await load();
    } catch (e) {
      setError(e instanceof ApiProblem ? arabicMessage(e) : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const imageProviderConfigured = providerState['pollinations-image'] === 'configured' || providerState['stability'] === 'configured';

  if (!ready || !session) return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;

  return (
    <AppShell session={session} title="Image Generation" subtitle="Real generation jobs: prompt → queue → worker → provider → S3 → library.">
      {error && <div className="alert err">{error}</div>}
      <div className="grid-2">
        <div className="glass-card" style={{ padding: 22 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 12 }}>Generate images</h3>
          <textarea
            className="input"
            rows={4}
            placeholder="Describe your image…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{ width: '100%', marginBottom: 10 }}
          />
          <input className="input" style={{ width: '100%', marginBottom: 10 }} placeholder="Negative prompt (optional)" value={negative} onChange={(e) => setNegative(e.target.value)} />
          <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <select className="input" value={style} onChange={(e) => setStyle(e.target.value)}>
              {STYLES.map((s) => <option key={s || 'none'} value={s}>{s || 'No style'}</option>)}
            </select>
            <select className="input" value={aspect} onChange={(e) => setAspect(e.target.value)}>
              {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="input" value={resolution} onChange={(e) => setResolution(e.target.value)}>
              {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} image{n > 1 ? 's' : ''}</option>)}
            </select>
          </div>
          <label className="btn btn-ghost" style={{ display: 'inline-flex', gap: 8, cursor: 'pointer' }}>
            <UploadCloud size={16} /> Reference images ({refImages.length})
            <input type="file" accept="image/*" multiple hidden onChange={(e) => setRefImages(Array.from(e.target.files ?? []))} />
          </label>
          {refImages.length > 0 && (
            <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {refImages.map((f, i) => (
                <span key={i} className="chip" style={{ display: 'inline-flex', gap: 6 }}>
                  {f.name}
                  <button onClick={() => setRefImages(refImages.filter((_, j) => j !== i))} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={generate} disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : <ImageIcon size={16} />} Generate
            </button>
            {!imageProviderConfigured && (
              <div className="alert err" style={{ marginTop: 10 }}>
                Provider not configured. Please configure STABILITY_API_KEY or OPENAI_API_KEY — the keyless
                Pollinations fallback may be unavailable from this network.
              </div>
            )}
          </div>
        </div>
        <div className="glass-card" style={{ padding: 22 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 12 }}>Generation jobs</h3>
          {jobs === null ? <div className="skel" style={{ height: 120 }} /> : jobs.length === 0 ? (
            <p className="muted">No image generation jobs yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {jobs.map((j) => (
                <div key={j.id} className="glass-panel" style={{ padding: 14 }}>
                  <div className="row between">
                    <strong style={{ fontSize: 13 }}>{j.prompt.slice(0, 60)}</strong>
                    <span className={`chip ${j.status === 'COMPLETED' ? 'on' : j.status === 'FAILED' ? '' : 'pending'}`}>
                      {j.status === 'COMPLETED' ? 'Completed' : j.status === 'FAILED' ? 'Failed' : 'Processing'}
                    </span>
                  </div>
                  {j.status === 'COMPLETED' && <p className="sm muted">Assets: {j.assetIds.length} — see Library → Images</p>}
                  {j.status === 'FAILED' && j.failureReason && <p className="sm" style={{ color: '#e06060' }}>{j.failureReason}</p>}
                  <p className="sm muted">{new Date(j.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => void load()}><RefreshCcw size={14} /> Refresh</button>
        </div>
      </div>
    </AppShell>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
