'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertCircle, Check, ExternalLink, Link2, RefreshCcw, Sparkles } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import ActionBar from '../../components/studio/ActionBar';
import { loadStudioSession } from '../../lib/studio-session';

type VideoStatus = 'READY' | 'COMPLETED' | 'DONE' | 'RENDERING' | 'QUEUED' | 'GENERATING' | 'PREPARING' | 'PENDING' | 'UPLOADING' | 'FAILED' | 'ERROR' | 'CANCELLED' | 'UNKNOWN';

function ResultInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const videoId = sp.get('videoId') || '';
  const orgId = sp.get('orgId') || '';
  const width = Number(sp.get('w') || 1280);
  const height = Number(sp.get('h') || 720);
  const seconds = Number(sp.get('sec') || 6);
  const model = sp.get('model') || 'lumen-pro';

  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<VideoStatus>('UNKNOWN');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const session = loadStudioSession();
  const isGuest = !session;
  const token = session?.tokens?.accessToken ?? '';

  // 1) Poll the real backend for status + signed stream URL.
  useEffect(() => {
    if (!videoId || !orgId) return;
    if (isGuest || !token) {
      setError('Sign in and configure a video provider to view the real result.');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const api = await import('../../lib/studio-api');
        const r = await api.getVideo(token, orgId, videoId);
        if (cancelled) return;
        if (r.reachable === false) {
          setError('API is unreachable. Check API_UPSTREAM in Vercel env.');
          return;
        }
        if (!r.ok) {
          setError(r.error?.detail ?? 'Failed to load the video.');
          return;
        }
        const v = r.data!;
        setStatus((v.status as VideoStatus) ?? 'UNKNOWN');
        if (v.status === 'READY' || v.status === 'COMPLETED' || v.status === 'DONE') {
          if (v.streamUrl) setSrc(v.streamUrl);
        } else if (v.status === 'FAILED' || v.status === 'ERROR' || v.status === 'CANCELLED') {
          setError(v.failureReason ?? 'Generation failed.');
        } else {
          // still processing — schedule another poll
          timer = setTimeout(tick, 3000);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [videoId, orgId, token, isGuest]);

  useEffect(() => {
    if (toast) {
      const t = window.setTimeout(() => setToast(null), 2200);
      return () => window.clearTimeout(t);
    }
  }, [toast]);

  function notify(msg: string) {
    setToast(msg);
  }

  async function regenerate() {
    if (!orgId || !videoId) return;
    if (isGuest) {
      notify('Sign in to use this action.');
      return;
    }
    setBusy('remix');
    try {
      const api = await import('../../lib/studio-api');
      const r = await api.regenerateVideo(token, orgId, videoId);
      if (r.ok) {
        notify('Starting a new render…');
        window.setTimeout(() => router.push('/generate'), 600);
      } else {
        notify(r.error?.detail ?? 'Could not start a new render.');
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!src) return;
    setBusy('download');
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `autocreator-${videoId}-${Math.round(width)}x${Math.round(height)}-${seconds}s.mp4`;
      a.click();
      notify('Download started');
    } catch (e) {
      notify(`Download failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'AutoCreator AI render', text: 'Made with AutoCreator AI', url: location.href });
        return;
      } catch {
        /* fall through */
      }
    }
    await copyLink();
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      notify('Link copied to clipboard');
    } catch {
      notify('Copy not available');
    }
  }

  if (!videoId || !orgId) {
    return (
      <div dir="ltr" className="studio-root">
        <div className="aurora a1" />
        <div className="grain" />
        <StudioNav minimal />
        <main className="shell" style={{ paddingTop: 60, textAlign: 'center' }}>
          <h1 style={{ fontSize: 30, fontWeight: 800 }}>No render to show</h1>
          <p className="muted" style={{ margin: '10px 0 20px' }}>Generate a video first, then it will appear here.</p>
          <button className="btn btn-primary btn-lg" onClick={() => router.push('/create')}>
            Create a video
          </button>
        </main>
      </div>
    );
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="aurora a3" />
      <div className="grain" />
      <StudioNav minimal />
      <main className="result-page">
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="stack">
          <div className="stage" style={{ aspectRatio: `${Math.round(width)}/${Math.round(height)}` }}>
            {src ? (
              <video
                ref={videoRef}
                src={src}
                controls
                autoPlay
                loop
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : error ? (
              <div className="overlay-mask" style={{ flexDirection: 'column', gap: 14, padding: 28, textAlign: 'center' }}>
                <AlertCircle size={32} style={{ color: 'var(--accent-strong)' }} />
                <div style={{ fontWeight: 700, fontSize: 15 }}>{error}</div>
                <button className="btn btn-primary" onClick={() => router.push('/create')}>
                  <Sparkles size={16} /> Try a new render
                </button>
                <a className="btn btn-ghost" href="/api/v1/health/providers" target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> Check provider status
                </a>
              </div>
            ) : (
              <div className="overlay-mask">
                <div className="spinner magenta" />
                <div className="sm muted" style={{ position: 'absolute', bottom: 18 }}>
                  {status === 'RENDERING' || status === 'GENERATING' ? 'Rendering…' : 'Loading…'}
                </div>
              </div>
            )}
            {busy && (
              <div className="overlay-mask">
                <div className="spinner magenta" />
              </div>
            )}
          </div>
          <ActionBar
            onDownload={download}
            onUpscale={regenerate}
            onExtend={regenerate}
            onRemix={regenerate}
            onShare={share}
            onCopyLink={copyLink}
            busyAction={busy}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="stack"
        >
          <div className="glass" style={{ padding: 18 }}>
            <span className="section-tag">About this render</span>
            <div className="stack" style={{ marginTop: 12, gap: 10 }}>
              <div className="row between">
                <span className="muted">Model</span>
                <b>{model}</b>
              </div>
              <div className="row between">
                <span className="muted">Resolution</span>
                <b>
                  {Math.round(width)} × {Math.round(height)}
                </b>
              </div>
              <div className="row between">
                <span className="muted">Duration</span>
                <b>{seconds}s</b>
              </div>
              <div className="row between">
                <span className="muted">Status</span>
                <b className="pill-note">
                  {status === 'READY' || status === 'COMPLETED' || status === 'DONE' ? (
                    <>
                      <Check size={13} /> Ready
                    </>
                  ) : status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED' ? (
                    <>Failed</>
                  ) : (
                    <>{status}</>
                  )}
                </b>
              </div>
              <div className="row between">
                <span className="muted">Video ID</span>
                <code className="sm muted">{videoId}</code>
              </div>
            </div>
          </div>
          <div className="glass" style={{ padding: 18 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="section-tag">More options</span>
            </div>
            <p className="sm muted">Re-run the render for a fresh take, download the file, or copy its link.</p>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="chip" onClick={regenerate} disabled={isGuest}>
                <RefreshCcw size={13} /> Re-render
              </button>
              <button className="chip" onClick={copyLink}>
                <Link2 size={13} /> Copy link
              </button>
            </div>
          </div>
        </motion.div>
      </main>
      {toast && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="toast">
          {toast}
        </motion.div>
      )}
    </div>
  );
}

export default function ResultPage() {
  return <Suspense fallback={null}><ResultInner /></Suspense>;
}
