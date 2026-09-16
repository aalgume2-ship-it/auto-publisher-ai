'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Clapperboard, Plus } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { loadStudioSession } from '../../lib/studio-session';
import { listVideos, playableVideoUrl, type VideoDto } from '../../lib/studio-api';

const STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Queued', PENDING: 'Queued', GENERATING: 'Generating', RENDERING: 'Rendering', UPLOADING: 'Uploading', READY: 'Completed',
  DONE: 'Completed', FAILED: 'Failed', ERROR: 'Failed', CANCELLED: 'Cancelled',
};

function DashboardInner() {
  const router = useRouter();
  const session = useMemo(() => loadStudioSession(), []);
  const [videos, setVideos] = useState<VideoDto[] | null>(null);

  useEffect(() => {
    if (!session) { router.replace('/login?next=/dashboard'); return; }
    if (!session.tokens?.accessToken || !session.orgId) {
      // no org yet → treat as empty library
      setVideos([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await listVideos(session.tokens!.accessToken, session.orgId!);
      if (!cancelled) setVideos(r.ok && r.data ? r.data.items : []);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" /><div className="aurora a2" /><div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ paddingTop: 24 }}>
        <div className="row between" style={{ marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800 }}>Your videos</h1>
            <p className="muted">Every render, saved and ready.</p>
          </div>
          <Link className="btn btn-primary" href="/create"><Plus size={17} /> New video</Link>
        </div>

        <span className="pill-note" style={{ marginBottom: 16 }}><Clapperboard size={13} /> Cloud library</span>

        {videos === null ? (
          <div className="loader-cards">
            <div className="skel" style={{ height: 180 }} /><div className="skel" style={{ height: 180 }} /><div className="skel" style={{ height: 180 }} />
          </div>
        ) : videos.length === 0 ? (
          <div className="glass" style={{ padding: 40, textAlign: 'center' }}>
            <Clapperboard size={30} style={{ opacity: 0.4, marginBottom: 12 }} />
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>No videos yet</h2>
            <p className="muted" style={{ margin: '8px 0 20px' }}>Create your first video — it will appear here once rendered.</p>
            <Link className="btn btn-primary btn-lg" href="/create">Create your first video</Link>
          </div>
        ) : (
          <div className="loader-cards">
            {videos.map((v, i) => {
              const ready = v.status === 'READY';
              const label = v.title || v.keyword || 'Untitled video';
              const thumb = playableVideoUrl(v.thumbnail || null);
              const secs = v.durationMs ? Math.round(v.durationMs / 1000) : null;
              return (
                <motion.div key={v.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.04 }} className="glass hoverable" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}><Clapperboard size={26} style={{ opacity: 0.35 }} /></div>
                    )}
                    {secs !== null && (
                      <span className="pill-note" style={{ position: 'absolute', right: 8, bottom: 8, fontSize: 11 }}>{secs}s</span>
                    )}
                  </div>
                  <div className="row between">
                    <span className={`chip ${ready ? 'on' : ''}`} style={{ pointerEvents: 'none' }}>{STATUS_LABEL[v.status] ?? 'Processing'}</span>
                    <span className="sm muted">{new Date(v.createdAt).toLocaleDateString()}</span>
                  </div>
                  <h3 style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.35 }}>{label}</h3>
                  <div className="row" style={{ marginTop: 'auto' }}>
                    {ready ? (
                      <Link className="btn btn-primary" style={{ flex: 1 }} href={`/result?mode=api&videoId=${v.id}&orgId=${session!.orgId}&w=720&h=1280&sec=${secs ?? 6}`}>Open</Link>
                    ) : (
                      <span className="sm muted">In progress…</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardInner />;
}
