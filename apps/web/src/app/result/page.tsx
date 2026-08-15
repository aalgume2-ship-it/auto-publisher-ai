'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, Link2, RefreshCcw } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import ActionBar from '../../components/studio/ActionBar';
import { loadStudioSession } from '../../lib/studio-session';
import { fetchStreamBlob, regenerateVideo } from '../../lib/studio-api';

function ResultInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const videoId = sp.get('videoId') || '';
  const orgId = sp.get('orgId') || '';
  const width = Number(sp.get('w') || 1280);
  const height = Number(sp.get('h') || 720);
  const seconds = Number(sp.get('sec') || 6);
  const model = sp.get('model') || 'Lumen';

  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const session = loadStudioSession();
  const token = session?.tokens?.accessToken;

  // Load the authenticated stream.
  useEffect(() => {
    if (!videoId || !orgId || !token) return;
    let cancelled = false;
    (async () => {
      const res = await fetchStreamBlob(orgId, videoId, token);
      if (!cancelled && res) setSrc(res.url);
    })();
    return () => { cancelled = true; };
  }, [videoId, orgId, token]);

  useEffect(() => { if (toast) { const t = window.setTimeout(() => setToast(null), 2200); return () => window.clearTimeout(t); } }, [toast]);
  function notify(msg: string) { setToast(msg); }

  async function regenerate() {
    if (!token || !orgId || !videoId) return;
    setBusy('remix');
    const r = await regenerateVideo(token, orgId, videoId);
    setBusy(null);
    if (r.ok) { notify('Starting a new render…'); window.setTimeout(() => router.push('/generate'), 600); }
    else notify('Could not start a new render right now.');
  }

  async function download() {
    if (!src) return;
    setBusy('download');
    try {
      // Signed S3 responses carry attachment headers; blob fallback URLs also
      // download directly. Avoid fetching media through the web runtime again.
      const a = document.createElement('a');
      a.href = src;
      a.download = `lumen-${videoId}-${Math.round(width)}x${Math.round(height)}-${seconds}s.mp4`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      notify('Download started');
    } catch { notify('Could not start download'); } finally { setBusy(null); }
  }
  async function share() {
    if (navigator.share) { try { await navigator.share({ title: 'Lumen Studio render', text: 'Made with Lumen', url: location.href }); return; } catch {} }
    await copyLink();
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); notify('Link copied to clipboard'); }
    catch { notify('Copy not available'); }
  }

  if (!videoId || !orgId) {
    return (
      <div dir="ltr" className="studio-root"><div className="aurora a1" /><div className="grain" /><StudioNav minimal />
        <main className="shell" style={{ paddingTop: 60, textAlign: 'center' }}>
          <h1 style={{ fontSize: 30, fontWeight: 800 }}>No render to show</h1>
          <p className="muted" style={{ margin: '10px 0 20px' }}>Generate a video first, then it will appear here.</p>
          <button className="btn btn-primary btn-lg" onClick={() => router.push('/create')}>Create a video</button>
        </main>
      </div>
    );
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" /><div className="aurora a2" /><div className="aurora a3" /><div className="grain" />
      <StudioNav minimal />
      <main className="result-page">
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="stack">
          <div className="stage" style={{ aspectRatio: `${Math.round(width)}/${Math.round(height)}` }}>
            {src ? (
              <video ref={videoRef} src={src} controls autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div className="overlay-mask"><div className="spinner magenta" /></div>
            )}
            {busy && <div className="overlay-mask"><div className="spinner magenta" /></div>}
          </div>
          <ActionBar onDownload={download} onUpscale={regenerate} onExtend={regenerate} onRemix={regenerate} onShare={share} onCopyLink={copyLink} busyAction={busy} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="stack">
          <div className="glass" style={{ padding: 18 }}>
            <span className="section-tag">About this render</span>
            <div className="stack" style={{ marginTop: 12, gap: 10 }}>
              <div className="row between"><span className="muted">Model</span><b>{model}</b></div>
              <div className="row between"><span className="muted">Resolution</span><b>{Math.round(width)} × {Math.round(height)}</b></div>
              <div className="row between"><span className="muted">Duration</span><b>{seconds}s</b></div>
              <div className="row between"><span className="muted">Source</span><b className="pill-note"><Check size={13} /> Cloud render</b></div>
            </div>
          </div>
          <div className="glass" style={{ padding: 18 }}>
            <div className="row" style={{ marginBottom: 8 }}><span className="section-tag">More options</span></div>
            <p className="sm muted">Re-run the render for a fresh take, download the file, or copy its link.</p>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="chip" onClick={regenerate}><RefreshCcw size={13} /> Re-render</button>
              <button className="chip" onClick={copyLink}><Link2 size={13} /> Copy link</button>
            </div>
          </div>
        </motion.div>
      </main>
      {toast && <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="toast">{toast}</motion.div>}
    </div>
  );
}

export default function ResultPage() {
  return <Suspense fallback={null}><ResultInner /></Suspense>;
}
