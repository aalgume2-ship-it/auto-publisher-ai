'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Calendar, Clapperboard, CreditCard, Image as ImageIcon, Library, Plus, Radio, TrendingUp } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { loadStudioSession } from '../../lib/studio-session';
import type { VideoDto } from '../../lib/studio-api';

const STATUS_LABEL: Record<string, string> = {
  QUEUED: 'Processing',
  PENDING: 'Processing',
  RENDERING: 'Rendering',
  READY: 'Completed',
  DONE: 'Completed',
  FAILED: 'Failed',
  ERROR: 'Failed',
  CANCELLED: 'Cancelled',
  GENERATING: 'Generating',
  PREPARING: 'Preparing',
  UPLOADING: 'Uploading',
};

function DashboardInner() {
  const session = useMemo(() => loadStudioSession(), []);
  const [videos, setVideos] = useState<VideoDto[] | null>(null);
  const isGuest = session?.mode === 'guest';

  useEffect(() => {
    if (isGuest) {
      try {
        const raw = window.localStorage.getItem('lumen.library.guest');
        if (raw) {
          setVideos(
            (JSON.parse(raw) as Array<{ id: string; keyword: string; status: string; createdAt: string }>).map((p) => ({
              id: p.id,
              keyword: p.keyword,
              status: p.status,
              createdAt: p.createdAt,
            })) as VideoDto[],
          );
        } else {
          setVideos([]);
        }
      } catch {
        setVideos([]);
      }
      return;
    }
    if (!session?.tokens?.accessToken || !session.orgId) {
      setVideos([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { listVideos } = await import('../../lib/studio-api');
      const r = await listVideos(session.tokens!.accessToken, session.orgId!);
      if (!cancelled) setVideos(r.ok && r.data ? r.data.items : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, isGuest]);

  const stats = useMemo(() => {
    const total = videos?.length ?? 0;
    const completed = (videos ?? []).filter((v) => v.status === 'READY' || v.status === 'DONE').length;
    const failed = (videos ?? []).filter((v) => v.status === 'FAILED' || v.status === 'ERROR').length;
    const inProgress = (videos ?? []).filter((v) => !['READY', 'DONE', 'FAILED', 'ERROR', 'CANCELLED'].includes(v.status)).length;
    return { total, completed, failed, inProgress };
  }, [videos]);

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ paddingTop: 20 }}>
        <div className="row between" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800 }}>Dashboard</h1>
            <p className="muted">Your creative control center.</p>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Link className="btn btn-ghost" href="/library">
              <Library size={16} /> Library
            </Link>
            <Link className="btn btn-primary" href="/create">
              <Plus size={16} /> New video
            </Link>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <StatTile icon={<Clapperboard size={18} />} label="Total videos" value={stats.total} />
          <StatTile icon={<TrendingUp size={18} />} label="Completed" value={stats.completed} />
          <StatTile icon={<Calendar size={18} />} label="In progress" value={stats.inProgress} />
          <StatTile icon={<Radio size={18} />} label="Failed" value={stats.failed} muted={stats.failed > 0} />
        </div>

        <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <Link className="btn btn-ghost" href="/library?tab=videos">
            <Clapperboard size={16} /> My videos
          </Link>
          <Link className="btn btn-ghost" href="/library?tab=images">
            <ImageIcon size={16} /> My images
          </Link>
          <Link className="btn btn-ghost" href="/library?tab=uploads">
            <Plus size={16} /> Uploads
          </Link>
          <Link className="btn btn-ghost" href="/calendar">
            <Calendar size={16} /> Calendar
          </Link>
          <Link className="btn btn-ghost" href="/connections">
            <Radio size={16} /> Connections
          </Link>
          <Link className="btn btn-ghost" href="/billing">
            <CreditCard size={16} /> Billing
          </Link>
        </div>

        <h2 className="section-tag" style={{ marginBottom: 10 }}>Recent renders</h2>
        {videos === null ? (
          <div className="loader-cards">
            <div className="skel" style={{ height: 180 }} />
            <div className="skel" style={{ height: 180 }} />
            <div className="skel" style={{ height: 180 }} />
          </div>
        ) : videos.length === 0 ? (
          <div className="glass" style={{ padding: 40, textAlign: 'center' }}>
            <Clapperboard size={30} style={{ opacity: 0.4, marginBottom: 12 }} />
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>No videos yet</h2>
            <p className="muted" style={{ margin: '8px 0 20px' }}>
              Create your first video — it will appear here once rendered.
            </p>
            <Link className="btn btn-primary btn-lg" href="/create">
              Create your first video
            </Link>
          </div>
        ) : (
          <div className="loader-cards">
            {videos.slice(0, 9).map((v) => (
              <motion.div
                key={v.id}
                className="glass hoverable"
                style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
                whileHover={{ y: -2 }}
              >
                <div
                  style={{
                    aspectRatio: '16/9',
                    background: 'linear-gradient(135deg,#1a1a1a,#0c0c0e)',
                    borderRadius: 10,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Clapperboard size={26} style={{ opacity: 0.4 }} />
                </div>
                <h3 style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{v.keyword || 'Untitled'}</h3>
                <div className="row between">
                  <span className="chip" style={{ pointerEvents: 'none', fontSize: 11 }}>
                    {STATUS_LABEL[v.status] ?? v.status}
                  </span>
                  <Link
                    className="btn btn-ghost sm"
                    href={`/result?videoId=${v.id}&orgId=${session?.orgId ?? 'guest'}`}
                    style={{ fontSize: 12, padding: '4px 10px' }}
                  >
                    Open
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatTile({ icon, label, value, muted = false }: { icon: React.ReactNode; label: string; value: number; muted?: boolean }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="glass" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-strong)' }}>{icon}</div>
      <div className="sm muted" style={{ marginTop: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, opacity: muted && value > 0 ? 0.7 : 1 }}>{value}</div>
    </motion.div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  );
}
