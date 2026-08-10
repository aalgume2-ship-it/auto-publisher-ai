'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Clapperboard, Image as ImageIcon, Search, Upload, Video } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { loadStudioSession } from '../../lib/studio-session';
import type { VideoDto } from '../../lib/studio-api';

type Tab = 'videos' | 'images' | 'uploads';
type Sort = 'recent' | 'oldest' | 'name';

function LibraryInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialTab = (sp.get('tab') as Tab) || 'videos';
  const [tab, setTab] = useState<Tab>(['videos', 'images', 'uploads'].includes(initialTab) ? initialTab : 'videos');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [videos, setVideos] = useState<VideoDto[] | null>(null);
  const [uploads, setUploads] = useState<Array<{ id: string; name: string; size: number; createdAt: string }>>([]);
  const session = useMemo(() => loadStudioSession(), []);
  const isGuest = session?.mode === 'guest';

  useEffect(() => {
    if (isGuest || !session?.tokens?.accessToken || !session.orgId) {
      setVideos([]);
      // Try a local fallback library from previous generations.
      try {
        const raw = window.localStorage.getItem('lumen.library.guest');
        if (raw) {
          const parsed = JSON.parse(raw) as Array<{ id: string; keyword: string; status: string; createdAt: string }>;
          setVideos(
            parsed.map((p) => ({
              id: p.id,
              keyword: p.keyword,
              status: p.status,
              createdAt: p.createdAt,
            })) as VideoDto[],
          );
        }
      } catch {
        /* ignore */
      }
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

  useEffect(() => {
    // Pull uploads from localStorage — uploaded files are persisted client-side
    // until the S3 multipart upload pipeline is enabled.
    try {
      const raw = window.localStorage.getItem('aca.uploads.v1');
      if (raw) setUploads(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const filtered = useMemo(() => {
    const arr = videos ?? [];
    const q = query.trim().toLowerCase();
    let out = arr.filter((v) => !q || (v.keyword ?? '').toLowerCase().includes(q));
    out = out.slice().sort((a, b) => {
      if (sort === 'recent') return (b.createdAt || '').localeCompare(a.createdAt || '');
      if (sort === 'oldest') return (a.createdAt || '').localeCompare(b.createdAt || '');
      return (a.keyword ?? '').localeCompare(b.keyword ?? '');
    });
    return out;
  }, [videos, query, sort]);

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ paddingTop: 20 }}>
        <div className="row between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800 }}>Library</h1>
            <p className="muted">Every render, image, and upload in one place.</p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link className="btn btn-ghost" href="/upload">
              <Upload size={16} /> Upload
            </Link>
            <Link className="btn btn-primary" href="/create">
              <Clapperboard size={16} /> New video
            </Link>
          </div>
        </div>

        <div className="row" style={{ marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
          <div className="opt-row" style={{ flex: 1, minWidth: 220 }}>
            <button className={`opt ${tab === 'videos' ? 'on' : ''}`} onClick={() => setTab('videos')}>
              <Clapperboard size={14} /> Videos
            </button>
            <button className={`opt ${tab === 'images' ? 'on' : ''}`} onClick={() => setTab('images')}>
              <ImageIcon size={14} /> Images
            </button>
            <button className={`opt ${tab === 'uploads' ? 'on' : ''}`} onClick={() => setTab('uploads')}>
              <Upload size={14} /> Uploads
            </button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <Search size={14} />
              <input
                type="text"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ background: 'transparent', border: 0, outline: 0, color: 'inherit', width: 180 }}
              />
            </div>
            <select className="chip" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="recent">Recent</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        {tab === 'videos' && (
          <div>
            {videos === null ? (
              <div className="loader-cards">
                <div className="skel" style={{ height: 180 }} />
                <div className="skel" style={{ height: 180 }} />
                <div className="skel" style={{ height: 180 }} />
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title="No videos yet"
                body="Render your first video to populate the library."
                cta="Create a video"
                onCta={() => router.push('/create')}
              />
            ) : (
              <div className="loader-cards">
                {filtered.map((v) => (
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
                      <Video size={28} style={{ opacity: 0.4 }} />
                    </div>
                    <h3 style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{v.keyword || 'Untitled'}</h3>
                    <div className="row between">
                      <span className="chip" style={{ pointerEvents: 'none', fontSize: 11 }}>
                        {v.status}
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
          </div>
        )}

        {tab === 'images' && (
          <EmptyState
            title="Image generation is on the way"
            body="Image Generation is wired into the AI providers abstraction. Configure OpenAI / Stability / Google AI and the image library will populate here."
            cta="Try a video"
            onCta={() => router.push('/create')}
          />
        )}

        {tab === 'uploads' && (
          <>
            {uploads.length === 0 ? (
              <EmptyState
                title="No uploads yet"
                body="Upload an MP4, MOV, or WebM file to add it to your library."
                cta="Upload now"
                onCta={() => router.push('/upload')}
              />
            ) : (
              <div className="loader-cards">
                {uploads.map((u) => (
                  <div key={u.id} className="glass" style={{ padding: 16 }}>
                    <div
                      style={{
                        aspectRatio: '16/9',
                        background: 'linear-gradient(135deg,#1a1a1a,#0c0c0e)',
                        borderRadius: 10,
                        display: 'grid',
                        placeItems: 'center',
                        marginBottom: 10,
                      }}
                    >
                      <Upload size={26} style={{ opacity: 0.4 }} />
                    </div>
                    <h3 style={{ fontWeight: 700, fontSize: 14 }}>{u.name}</h3>
                    <div className="sm muted">{(u.size / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState({
  title,
  body,
  cta,
  onCta,
}: {
  title: string;
  body: string;
  cta: string;
  onCta: () => void;
}) {
  return (
    <div className="glass" style={{ padding: 40, textAlign: 'center' }}>
      <Clapperboard size={28} style={{ opacity: 0.4, marginBottom: 12 }} />
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>{title}</h2>
      <p className="muted" style={{ margin: '8px 0 20px', maxWidth: 460, marginInline: 'auto' }}>
        {body}
      </p>
      <button className="btn btn-primary btn-lg" onClick={onCta}>
        {cta}
      </button>
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={null}>
      <LibraryInner />
    </Suspense>
  );
}
