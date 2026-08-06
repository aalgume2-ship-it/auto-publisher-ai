'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Clapperboard, Plus } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { loadStudioSession } from '../../lib/studio-session';
import { listVideos, type VideoDto } from '../../lib/studio-api';

const STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Processing', PENDING: 'Processing', RENDERING: 'Rendering', READY: 'Completed',
  DONE: 'Completed', FAILED: 'Processing', ERROR: 'Processing', CANCELLED: 'Processing',
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
              return (
                <motion.div key={v.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.04 }} className="glass hoverable" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="row between">
                    <span className={`chip ${ready ? 'on' : ''}`} style={{ pointerEvents: 'none' }}>{STATUS_LABEL[v.status] ?? 'Processing'}</span>
                  </div>
                  <h3 style={{ fontWeight: 700, fontSize: 15 }}>{v.keyword || 'Untitled video'}</h3>
                  <p className="sm muted" style={{ lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.keyword}</p>
                  <div className="row" style={{ marginTop: 'auto' }}>
                    {ready ? (
                      <Link className="btn btn-primary" style={{ flex: 1 }} href={`/result?mode=api&videoId=${v.id}&orgId=${session!.orgId}`}>Open</Link>
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
