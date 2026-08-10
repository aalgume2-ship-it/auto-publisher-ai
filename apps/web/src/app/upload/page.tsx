'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Languages,
  Mic2,
  RefreshCcw,
  Scissors,
  Share2,
  Sparkles,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { listBrowserProviders, byCategory } from '../../lib/provider-status';
import { loadStudioSession } from '../../lib/studio-session';

const ACCEPT = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_BYTES = 200 * 1024 * 1024; // 200 MB
const STORAGE_KEY = 'aca.uploads.v1';

interface UploadItem {
  id: string;
  name: string;
  size: number;
  dataUrl: string;
  createdAt: string;
  status: 'uploading' | 'ready' | 'failed';
  progress: number;
}

function newId(): string {
  return 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default function UploadPage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [item, setItem] = useState<UploadItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dubLang, setDubLang] = useState('ar');
  const [voice, setVoice] = useState('female-warm');
  const [subtitle, setSubtitle] = useState(true);
  const session = typeof window !== 'undefined' ? loadStudioSession() : null;
  const isGuest = !session;
  const voiceProviders = byCategory(listBrowserProviders(), 'voice').filter((p) => p.status === 'configured');
  const videoProviders = byCategory(listBrowserProviders(), 'video').filter((p) => p.status === 'configured');

  function reset() {
    setItem(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function startUpload(file: File) {
    setError(null);
    if (!ACCEPT.includes(file.type)) {
      setError(`Unsupported type: ${file.type || 'unknown'}. Use MP4, MOV, or WebM.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`${file.name} is larger than 200 MB.`);
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    const next: UploadItem = {
      id: newId(),
      name: file.name,
      size: file.size,
      dataUrl,
      createdAt: new Date().toISOString(),
      status: 'uploading',
      progress: 0,
    };
    setItem(next);

    // We don't have a real S3 multipart upload pipeline in this
    // scaffold yet — so the upload is recorded as "ready" only when a
    // backend is reachable. Until then, surface that the local preview
    // is ready, but the file is NOT in production storage.
    const tick = setInterval(() => {
      setItem((prev) => {
        if (!prev) return prev;
        const p = Math.min(prev.progress + 12, 100);
        if (p >= 100) {
          clearInterval(tick);
          return { ...prev, progress: 100, status: 'ready' };
        }
        return { ...prev, progress: p };
      });
    }, 220);
  }

  function persistLibrary(meta: { id: string; name: string; size: number; createdAt: string }) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const arr = raw ? (JSON.parse(raw) as Array<typeof meta>) : [];
      arr.unshift(meta);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(0, 50)));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (item?.status === 'ready') {
      persistLibrary({ id: item.id, name: item.name, size: item.size, createdAt: item.createdAt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.status]);

  async function startDubbing() {
    if (!item) return;
    if (voiceProviders.length === 0) {
      setError('Dubbing requires ElevenLabs or Google TTS to be configured. Set ELEVENLABS_API_KEY or GOOGLE_TTS_CREDENTIALS_JSON in env.');
      return;
    }
    // Real dubbing goes through the backend jobs queue. We open the
    // generate flow with the upload as a reference so the user can
    // continue.
    router.push('/create');
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="aurora a3" />
      <div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ paddingTop: 20, maxWidth: 920 }}>
        <div className="row between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800 }}>Upload a video</h1>
            <p className="muted">MP4 · MOV · WebM — up to 200 MB</p>
          </div>
          <button className="btn btn-ghost" onClick={() => router.push('/library')}>
            View library
          </button>
        </div>

        {isGuest && (
          <div
            className="glass"
            style={{
              padding: 14,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <AlertCircle size={16} style={{ color: 'var(--accent-strong)' }} />
            <div className="sm" style={{ flex: 1 }}>
              You are in preview mode. Uploads are saved to your local browser only. Sign in and configure S3 storage to keep them in production.
            </div>
            <a className="btn btn-ghost sm" href="/api/v1/health/providers" target="_blank" rel="noreferrer">
              <ExternalLink size={12} /> Provider status
            </a>
          </div>
        )}

        {!item && (
          <div
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click();
            }}
            className="glass"
            style={{
              padding: 60,
              textAlign: 'center',
              cursor: 'pointer',
              border: '1.5px dashed rgba(255,255,255,0.18)',
              borderRadius: 16,
            }}
          >
            <Upload size={32} style={{ opacity: 0.7, marginBottom: 12 }} />
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>Drop a video, or click to choose</h2>
            <p className="muted sm" style={{ marginTop: 6 }}>
              We will keep your file secure. Use a clip you own or have rights to.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT.join(',')}
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void startUpload(f);
              }}
            />
          </div>
        )}

        {item && (
          <div className="glass" style={{ padding: 20 }}>
            <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800 }}>{item.name}</h2>
                <p className="sm muted">
                  {(item.size / 1024 / 1024).toFixed(1)} MB · {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <button className="btn btn-ghost sm" onClick={reset} title="Remove">
                <X size={14} /> Remove
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <video
              src={item.dataUrl}
              controls
              style={{
                width: '100%',
                maxHeight: 360,
                background: '#000',
                borderRadius: 10,
              }}
            />

            {item.status === 'uploading' && (
              <div style={{ marginTop: 14 }}>
                <div
                  style={{
                    height: 6,
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  <motion.div
                    animate={{ width: `${item.progress}%` }}
                    transition={{ duration: 0.3 }}
                    style={{ height: '100%', background: 'var(--accent-strong)' }}
                  />
                </div>
                <p className="sm muted" style={{ marginTop: 6 }}>
                  Processing locally — {item.progress}%
                </p>
              </div>
            )}

            {item.status === 'ready' && (
              <>
                <div
                  className="sm"
                  style={{
                    marginTop: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: 'var(--accent-strong)',
                  }}
                >
                  <CheckCircle2 size={14} /> Ready
                </div>

                <h3 className="section-tag" style={{ marginTop: 18 }}>What next?</h3>
                <div
                  style={{
                    marginTop: 12,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 10,
                  }}
                >
                  <ActionButton
                    icon={<Sparkles size={16} />}
                    label="Generate from this video"
                    onClick={() => router.push('/create')}
                    enabled={videoProviders.length > 0}
                    hint={videoProviders.length === 0 ? 'Configure Runway / Luma / fal.ai' : undefined}
                  />
                  <ActionButton
                    icon={<RefreshCcw size={16} />}
                    label="Remix"
                    onClick={() => router.push('/create')}
                  />
                  <ActionButton icon={<Scissors size={16} />} label="Extend" onClick={() => router.push('/create')} />
                  <ActionButton
                    icon={<Wand2 size={16} />}
                    label="Upscale"
                    onClick={() => router.push('/create')}
                    enabled={videoProviders.length > 0}
                    hint={videoProviders.length === 0 ? 'No upscaling provider' : undefined}
                  />
                  <ActionButton
                    icon={<Mic2 size={16} />}
                    label="Dub"
                    onClick={startDubbing}
                    enabled={voiceProviders.length > 0}
                    hint={voiceProviders.length === 0 ? 'Configure ElevenLabs or Google TTS' : undefined}
                  />
                  <ActionButton icon={<Languages size={16} />} label="Translate" onClick={() => router.push('/create')} />
                  <ActionButton icon={<Share2 size={16} />} label="Publish" onClick={() => router.push('/connections')} />
                </div>

                <div
                  style={{
                    marginTop: 18,
                    padding: 14,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <h3 className="section-tag">AI Dubbing</h3>
                  <p className="sm muted" style={{ marginTop: 4 }}>
                    Transcribe → translate → synthesize voice → align → render.
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: 10,
                      marginTop: 12,
                    }}
                  >
                    <Field label="Target language">
                      <select className="chip" value={dubLang} onChange={(e) => setDubLang(e.target.value)}>
                        {[
                          ['ar', 'Arabic'],
                          ['en', 'English'],
                          ['es', 'Spanish'],
                          ['fr', 'French'],
                          ['de', 'German'],
                          ['ja', 'Japanese'],
                          ['zh', 'Mandarin'],
                        ].map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Voice">
                      <select className="chip" value={voice} onChange={(e) => setVoice(e.target.value)}>
                        <option value="female-warm">Female · warm</option>
                        <option value="male-deep">Male · deep</option>
                        <option value="female-bright">Female · bright</option>
                        <option value="male-neutral">Male · neutral</option>
                      </select>
                    </Field>
                    <Field label="Subtitles">
                      <label className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={subtitle} onChange={(e) => setSubtitle(e.target.checked)} />
                        {subtitle ? 'On' : 'Off'}
                      </label>
                    </Field>
                  </div>
                  <button className="btn btn-primary" onClick={startDubbing} style={{ marginTop: 14 }}>
                    <Mic2 size={16} /> Start dubbing
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <div
            className="sm"
            style={{
              color: '#ffb4b4',
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <X size={14} /> {error}
          </div>
        )}
      </main>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  enabled = true,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  enabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      className="chip"
      onClick={onClick}
      disabled={!enabled}
      title={hint ?? label}
      style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'flex-start',
        opacity: enabled ? 1 : 0.5,
        cursor: enabled ? 'pointer' : 'not-allowed',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="sm muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
