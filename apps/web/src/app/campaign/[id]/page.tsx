'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Copy, Check, Film, Image as ImageIcon, Type, Hash, Target, MessageCircle,
  Loader2, RefreshCcw, Smartphone, Monitor, Clapperboard,
} from 'lucide-react';
import CampaignHeader from '../../../components/marketing/CampaignHeader';
import { loadStudioSession } from '../../../lib/studio-session';
import { getVideo, playableVideoUrl, type VideoDto } from '../../../lib/studio-api';
import {
  buildCampaignPackage, AD_STYLE_LABELS, BUSINESS_TYPE_LABELS, PLATFORM_LABELS,
  type BusinessType, type AdStyle,
} from '../../../lib/campaign-copy';

interface CampaignMeta {
  name: string; type: BusinessType; offer: string; style: AdStyle;
  platforms: string[]; image: string | null; videoIds: string[]; createdAt: number;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="chip"
      style={{ cursor: 'pointer', gap: 6 }}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ }
      }}
      title="نسخ"
    >
      {done ? <Check size={13} color="#D4FF32" /> : <Copy size={13} />} {done ? 'تم النسخ' : 'نسخ'}
    </button>
  );
}

function Section({ icon: Icon, title, count, children }: { icon: typeof Film; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="glass" style={{ padding: 22, marginTop: 18 }}>
      <div className="row" style={{ gap: 10, marginBottom: 14 }}>
        <Icon size={19} style={{ opacity: 0.85 }} />
        <h2 style={{ fontSize: 19, fontWeight: 800 }}>{title}</h2>
        {count !== undefined && <span className="pill-note">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function DesignCard({ meta, cta, variant }: { meta: CampaignMeta; cta: string; variant: 'post' | 'story' | 'snap' }) {
  const aspect = variant === 'post' ? '1 / 1' : '9 / 16';
  const width = variant === 'post' ? 260 : 190;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <div style={{
        position: 'relative', aspectRatio: aspect, width, borderRadius: 18, overflow: 'hidden',
        background: meta.image ? '#000' : 'linear-gradient(150deg,#1b1440,#0a0a14 55%,#231a05)',
        border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
        {meta.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meta.image} alt={meta.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.92 }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.82))' }} />
        <div style={{ position: 'relative', padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#D4FF32', marginBottom: 4 }}>
            {variant === 'post' ? 'POST 1:1' : variant === 'story' ? 'STORY 9:16' : 'SNAP 9:16'}
          </div>
          <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.35, textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>{meta.name}</div>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{meta.offer}</div>
          <div style={{ marginTop: 8, display: 'inline-block', padding: '6px 14px', borderRadius: 999, background: 'linear-gradient(135deg,#D4FF32,#9dff5c)', color: '#0a0a10', fontWeight: 800, fontSize: 11 }}>
            {cta}
          </div>
        </div>
      </div>
      <span className="sm muted">{variant === 'post' ? 'منشور مربع' : variant === 'story' ? 'ستوري' : 'سناب'}</span>
    </div>
  );
}

function CampaignInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const seriesId = params?.id;
  const session = useMemo(() => (typeof window !== 'undefined' ? loadStudioSession() : null), []);
  const [meta, setMeta] = useState<CampaignMeta | null>(null);
  const [videos, setVideos] = useState<Record<string, VideoDto>>({});
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!seriesId) return;
    try {
      const raw = localStorage.getItem(`lumen.campaign.${seriesId}`);
      if (raw) setMeta(JSON.parse(raw) as CampaignMeta);
    } catch { /* ignore */ }
    setLoading(false);
  }, [seriesId]);

  const poll = useCallback(async () => {
    if (!session?.tokens?.accessToken || !session.orgId || !seriesId) return;
    const token = session.tokens.accessToken;
    const ids = meta?.videoIds ?? Object.keys(videos);
    if (!ids.length) return;
    const next: Record<string, VideoDto> = { ...videos };
    await Promise.all(ids.map(async (id) => {
      const r = await getVideo(token, session.orgId!, id);
      if (r.ok && r.data) next[id] = r.data;
    }));
    setVideos(next);
  }, [session, seriesId, meta, videos]);

  useEffect(() => {
    if (!session) { router.replace('/login?next=' + encodeURIComponent(`/campaign/${seriesId}`)); return; }
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, tick]);

  const pending = Object.values(videos).some((v) => v && v.status !== 'READY' && v.status !== 'FAILED');
  useEffect(() => {
    if (!pending) return;
    const t = window.setInterval(() => setTick(x => x + 1), 5000);
    return () => window.clearInterval(t);
  }, [pending]);

  const pkg = useMemo(() => meta ? buildCampaignPackage({ name: meta.name, type: meta.type, offer: meta.offer, style: meta.style, platforms: meta.platforms }) : null, [meta]);
  const videoList = (meta?.videoIds ?? Object.keys(videos)).map((id) => videos[id]).filter(Boolean);
  const readyCount = videoList.filter((v) => v.status === 'READY').length;

  if (loading || !session) {
    return <div dir="rtl" className="studio-root"><div className="aurora a1" /><div className="grain" /><CampaignHeader /><main className="shell" style={{ paddingTop: 80, textAlign: 'center' }}><Loader2 size={30} className="spin" style={{ margin: '0 auto' }} /></main></div>;
  }

  const totalAssets = 20;

  return (
    <div dir="rtl" className="studio-root">
      <div className="aurora a1" /><div className="aurora a2" /><div className="grain" />
      <CampaignHeader active="campaigns" />
      <main className="shell" style={{ paddingTop: 24, maxWidth: 1080 }}>
        {meta ? (
          <>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass" style={{ padding: 26 }}>
              <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <span className="pill-note" style={{ marginBottom: 10, display: 'inline-block' }}>✨ حملتك جاهزة</span>
                  <h1 style={{ fontSize: 30, fontWeight: 800 }}>{meta.name}</h1>
                  <p className="muted" style={{ marginTop: 6, fontSize: 15 }}>{meta.offer}</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 34, fontWeight: 800, color: '#D4FF32' }}>{totalAssets}</div>
                  <div className="sm muted">قطعة إعلانية</div>
                </div>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <span className="chip on" style={{ pointerEvents: 'none' }}>{BUSINESS_TYPE_LABELS[meta.type]}</span>
                <span className="chip on" style={{ pointerEvents: 'none' }}>أسلوب {AD_STYLE_LABELS[meta.style]}</span>
                {meta.platforms.map((p) => <span key={p} className="chip" style={{ pointerEvents: 'none' }}>{PLATFORM_LABELS[p]}</span>)}
              </div>
            </motion.div>

            {/* Videos */}
            <Section icon={Film} title="🎬 الفيديوهات الإعلانية" count={videoList.length || (meta.videoIds.length)}>
              <div className="loader-cards">
                {(meta.videoIds.length ? meta.videoIds : []).map((id, i) => {
                  const v = videos[id];
                  const angle = pkg?.videoAngles[i];
                  const src = v?.status === 'READY' ? playableVideoUrl(v.streamUrl ?? v.videoUrl) : null;
                  return (
                    <div key={id} className="glass hoverable" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ aspectRatio: '9 / 16', borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', display: 'grid', placeItems: 'center', maxHeight: 380 }}>
                        {src ? (
                          <video src={src} controls loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : v?.status === 'FAILED' ? (
                          <div style={{ textAlign: 'center', padding: 14 }}>
                            <p className="sm" style={{ marginBottom: 8 }}>تعذّر توليد هذا الفيديو</p>
                            <button className="chip" onClick={() => setTick(t => t + 1)}><RefreshCcw size={13} /> تحديث</button>
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', padding: 14 }}>
                            <Loader2 size={26} className="spin" style={{ margin: '0 auto 10px' }} />
                            <p className="sm muted">{v?.status === 'RENDERING' || v?.status === 'GENERATING' ? 'جاري التصوير…' : 'في قائمة الإنتاج…'}</p>
                            {angle && <p className="sm muted" style={{ marginTop: 4, opacity: 0.7 }}>{angle.label}</p>}
                          </div>
                        )}
                      </div>
                      <b style={{ fontSize: 13 }}>{angle?.label ?? `فيديو ${i + 1}`}</b>
                    </div>
                  );
                })}
              </div>
              {pending && <p className="sm muted" style={{ marginTop: 10 }}>⏳ تُنتج الفيديوهات الآن ({readyCount}/{meta.videoIds.length} جاهز) — تتحدث الصفحة تلقائيًا كل 5 ثوانٍ.</p>}
            </Section>

            {/* Designs */}
            <Section icon={ImageIcon} title="🖼️ التصاميم الجاهزة للنشر" count={3}>
              <div className="row" style={{ gap: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
                {(['post', 'story', 'snap'] as const).map((variant) => (
                  <DesignCard key={variant} meta={meta} cta={pkg?.cta ?? 'اطلب الآن'} variant={variant} />
                ))}
              </div>
            </Section>

            {/* Hooks */}
            <Section icon={Type} title="🪝 الهوكات — أول 3 ثوانٍ" count={pkg?.hooks.length}>
              <div style={{ display: 'grid', gap: 10 }}>
                {pkg?.hooks.map((h, i) => (
                  <div key={i} className="row between" style={{ gap: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 14px' }}>
                    <span style={{ fontSize: 15, lineHeight: 1.5 }}>{h}</span>
                    <CopyButton text={h} />
                  </div>
                ))}
              </div>
            </Section>

            {/* Ad texts */}
            <Section icon={Clapperboard} title="✍️ النصوص الإعلانية" count={pkg?.adTexts.length}>
              <div style={{ display: 'grid', gap: 10 }}>
                {pkg?.adTexts.map((t, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 14, lineHeight: 1.65 }}>{t}</span>
                    <CopyButton text={t} />
                  </div>
                ))}
              </div>
            </Section>

            {/* Captions */}
            <Section icon={Smartphone} title="📱 كابشنز المنصات" count={pkg?.captions.length}>
              <div style={{ display: 'grid', gap: 10 }}>
                {pkg?.captions.map((c, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 14px' }}>
                    <div className="row between" style={{ marginBottom: 6 }}>
                      <span className="pill-note">{PLATFORM_LABELS[meta.platforms[i % Math.max(meta.platforms.length, 1)]] ?? 'Instagram'}</span>
                      <CopyButton text={c} />
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{c}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* Hashtags + CTA + WhatsApp */}
            <Section icon={Hash} title="#️⃣ الهاشتاقات" count={pkg?.hashtags.length}>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {pkg?.hashtags.map((h) => <span key={h} className="chip" style={{ pointerEvents: 'none', fontSize: 13 }}>{h}</span>)}
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <CopyButton text={pkg?.hashtags.join(' ') ?? ''} />
              </div>
            </Section>

            <div className="loader-cards">
              <div className="glass" style={{ padding: 20 }}>
                <div className="row" style={{ gap: 10, marginBottom: 10 }}><Target size={17} /><b>🎯 نداء الإجراء (CTA)</b></div>
                <div className="row between" style={{ gap: 12 }}>
                  <b style={{ fontSize: 17, color: '#D4FF32' }}>{pkg?.cta}</b>
                  <CopyButton text={pkg?.cta ?? ''} />
                </div>
              </div>
              <div className="glass" style={{ padding: 20 }}>
                <div className="row" style={{ gap: 10, marginBottom: 10 }}><MessageCircle size={17} /><b>💬 رسالة الواتساب الجاهزة</b></div>
                <p style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-line', background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12 }}>{pkg?.whatsappMessage}</p>
                <div className="row" style={{ marginTop: 12, gap: 10 }}>
                  <a className="btn btn-primary" style={{ textDecoration: 'none', fontSize: 13 }} href={`https://wa.me/?text=${encodeURIComponent(pkg?.whatsappMessage ?? '')}`} target="_blank" rel="noreferrer">
                    <MessageCircle size={14} /> افتح واتساب
                  </a>
                  <CopyButton text={pkg?.whatsappMessage ?? ''} />
                </div>
              </div>
            </div>

            <div className="row" style={{ gap: 10, marginTop: 22, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="chip" onClick={() => router.push('/campaign/new')}><Monitor size={14} /> حملة جديدة</button>
              <button className="chip" onClick={() => setTick(t => t + 1)}><RefreshCcw size={14} /> تحديث الحالة</button>
            </div>
          </>
        ) : (
          <div className="glass" style={{ padding: 40, textAlign: 'center' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800 }}>الحملة غير موجودة في هذا المتصفح</h1>
            <p className="muted" style={{ margin: '10px 0 20px' }}>ربما أنشأت الحملة من جهاز آخر. مع ذلك، فيديوهات الحملة محفوظة في حسابك.</p>
            <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
              <button className="btn btn-primary" onClick={() => router.push('/campaigns')}>حملاتي</button>
              <button className="chip" onClick={() => router.push('/campaign/new')}>إنشاء حملة</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function CampaignDetailPage() {
  return <CampaignInner />;
}
