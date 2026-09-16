'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FolderKanban, Loader2, Plus, RefreshCcw } from 'lucide-react';
import CampaignHeader from '../../components/marketing/CampaignHeader';
import { loadStudioSession, clearStudioSession } from '../../lib/studio-session';
import { listSeries, listVideos, type SeriesDto, type VideoDto } from '../../lib/studio-api';

interface CampaignMetaLite { name: string; type: string; offer: string; style: string; image: string | null; }

function CampaignsInner() {
  const router = useRouter();
  const session = useMemo(() => (typeof window !== 'undefined' ? loadStudioSession() : null), []);
  const [series, setSeries] = useState<SeriesDto[] | null>(null);
  const [videos, setVideos] = useState<VideoDto[]>([]);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!session) { router.replace('/login?next=%2Fcampaigns'); return; }
    if (!session.tokens?.accessToken || !session.orgId) { setSeries([]); return; }
    let cancelled = false;
    (async () => {
      const [s, v] = await Promise.all([
        listSeries(session.tokens!.accessToken, session.orgId!),
        listVideos(session.tokens!.accessToken, session.orgId!),
      ]);
      if (cancelled) return;
      if (s.ok && s.data) {
        setSeries(s.data.items);
        setVideos(v.ok && v.data ? v.data.items : []);
        setFailed(false);
      } else if (v.error?.status === 401) {
        clearStudioSession();
        router.replace('/login?next=%2Fcampaigns');
      } else {
        setFailed(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, tick]);

  const campaigns = useMemo(() => {
    if (!series) return null;
    return series.map((s) => {
      let meta: CampaignMetaLite | null = null;
      try {
        const raw = localStorage.getItem(`lumen.campaign.${s.id}`);
        if (raw) meta = JSON.parse(raw) as CampaignMetaLite;
      } catch { /* ignore */ }
      const vids = videos.filter((v) => v.seriesId === s.id);
      const ready = vids.filter((v) => v.status === 'READY').length;
      return { series: s, meta, vids, ready };
    });
  }, [series, videos]);

  const pending = videos.some((v) => v.seriesId && v.status !== 'READY' && v.status !== 'FAILED');
  useEffect(() => {
    if (!pending) return;
    const t = window.setInterval(() => setTick(x => x + 1), 6000);
    return () => window.clearInterval(t);
  }, [pending]);

  if (!session || campaigns === null) {
    return (
      <div dir="rtl" className="studio-root"><div className="aurora a1" /><div className="grain" /><CampaignHeader active="campaigns" />
        <main className="shell" style={{ paddingTop: 80, textAlign: 'center' }}><Loader2 size={30} className="spin" style={{ margin: '0 auto' }} /></main>
      </div>
    );
  }

  return (
    <div dir="rtl" className="studio-root">
      <div className="aurora a1" /><div className="aurora a2" /><div className="grain" />
      <CampaignHeader active="campaigns" />
      <main className="shell" style={{ paddingTop: 24, maxWidth: 1080 }}>
        <div className="row between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800 }}>حملاتي</h1>
            <p className="muted">كل حملاتك التسويقية في مكان واحد.</p>
          </div>
          <Link className="btn btn-primary" href="/campaign/new"><Plus size={17} /> حملة جديدة</Link>
        </div>

        {failed ? (
          <div className="glass" style={{ padding: 40, textAlign: 'center' }}>
            <p style={{ marginBottom: 14 }}>تعذّر تحميل الحملات.</p>
            <button className="btn btn-primary" onClick={() => setTick(t => t + 1)}><RefreshCcw size={15} /> إعادة المحاولة</button>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="glass" style={{ padding: 40, textAlign: 'center' }}>
            <FolderKanban size={30} style={{ opacity: 0.4, marginBottom: 12 }} />
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>لا توجد حملات بعد</h2>
            <p className="muted" style={{ margin: '8px 0 20px' }}>ارفع صورة منتجك، اكتب عرضك، ودع Lumen يصنع حملتك كاملة.</p>
            <Link className="btn btn-primary btn-lg" href="/campaign/new">أنشئ أول حملة</Link>
          </div>
        ) : (
          <div className="loader-cards">
            {campaigns.map(({ series: s, meta, vids, ready }, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass hoverable" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', display: 'grid', placeItems: 'center' }}>
                  {meta?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={meta.image} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <FolderKanban size={26} style={{ opacity: 0.3 }} />
                  )}
                </div>
                <div className="row between">
                  <span className={`chip ${ready === vids.length && vids.length > 0 ? 'on' : ''}`} style={{ pointerEvents: 'none' }}>
                    {ready === vids.length && vids.length > 0 ? 'جاهزة ✓' : 'قيد الإنتاج…'}
                  </span>
                  <span className="sm muted">{new Date(s.id ? vids[0]?.createdAt ?? Date.now() : Date.now()).toLocaleDateString('ar-SA')}</span>
                </div>
                <h3 style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.4 }}>{meta?.name ?? s.name.replace(/^حملة:?\s*/, '')}</h3>
                {meta?.offer && <p className="sm muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{meta.offer}</p>}
                <div className="row between" style={{ marginTop: 'auto' }}>
                  <span className="sm muted">{vids.length} فيديو · {ready} جاهز</span>
                  <Link className="btn btn-primary" style={{ fontSize: 13, padding: '7px 14px' }} href={`/campaign/${s.id}`}>افتح الحملة</Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function CampaignsPage() {
  return <CampaignsInner />;
}
