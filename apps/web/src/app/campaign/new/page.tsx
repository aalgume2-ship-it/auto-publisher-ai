'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Store, Utensils, Building2, Smartphone, User, BadgePercent, Package, Briefcase,
  Check, ChevronLeft, Upload, Sparkles, Loader2,
} from 'lucide-react';
import CampaignHeader from '../../../components/marketing/CampaignHeader';
import { loadStudioSession } from '../../../lib/studio-session';
import { createCampaignSeries, generateVideo } from '../../../lib/studio-api';
import {
  BUSINESS_TYPE_LABELS, AD_STYLE_LABELS, PLATFORM_LABELS,
  buildCampaignPackage, type BusinessType, type AdStyle,
} from '../../../lib/campaign-copy';

const TYPES: { id: BusinessType; icon: typeof Package }[] = [
  { id: 'product', icon: Package }, { id: 'service', icon: Briefcase },
  { id: 'restaurant', icon: Utensils }, { id: 'store', icon: Store },
  { id: 'realestate', icon: Building2 }, { id: 'app', icon: Smartphone },
  { id: 'personal', icon: User }, { id: 'discount', icon: BadgePercent },
];

const STYLES: AdStyle[] = ['luxury', 'youth', 'saudi', 'trend', 'formal', 'ugc', 'cinematic'];
const PLATFORMS = ['instagram', 'tiktok', 'snapchat', 'whatsapp', 'facebook', 'youtube'];

const STEP_TITLES = ['ماذا تسوّق؟', 'ارفع صورة المنتج', 'اكتب العرض', 'أين تريد نشره؟', 'اختر أسلوب الإعلان'];

function WizardInner() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<BusinessType>('product');
  const [name, setName] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [offer, setOffer] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['instagram', 'tiktok', 'snapchat']);
  const [style, setStyle] = useState<AdStyle>('luxury');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canNext = useMemo(() => {
    if (step === 2) return name.trim().length >= 2 && offer.trim().length >= 5;
    return true;
  }, [step, name, offer]);

  function togglePlatform(p: string) {
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  function onImage(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr('اختر ملف صورة صحيح.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Resize to max 900px so the data URL stays localStorage-friendly.
        const scale = Math.min(1, 900 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        setImage(canvas.toDataURL('image/jpeg', 0.82));
        setErr(null);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function createCampaign() {
    setBusy(true); setErr(null);
    try {
      const session = loadStudioSession();
      if (!session?.tokens?.accessToken || !session.orgId) {
        router.push('/login?next=%2Fcampaign%2Fnew');
        return;
      }
      const token = session.tokens.accessToken;
      const pkg = buildCampaignPackage({ name: name.trim(), type, offer: offer.trim(), style, platforms });

      // 1) Campaign container (Arabic series).
      const series = await createCampaignSeries(token, session.orgId, `حملة: ${name.trim()}`, type);
      if (!series.ok || !series.data?.id) throw new Error(series.error?.detail || 'تعذّر إنشاء الحملة');
      const seriesId = series.data.id;

      // 2) Kick off the three ad videos on the proven generation pipeline.
      const videoIds: string[] = [];
      for (const angle of pkg.videoAngles) {
        const v = await generateVideo(token, session.orgId, seriesId, angle.keyword, 20);
        const id = v.data?.video?.id || v.data?.id;
        if (id) videoIds.push(id);
      }

      // 3) Persist campaign meta for the detail page.
      localStorage.setItem(`lumen.campaign.${seriesId}`, JSON.stringify({
        name: name.trim(), type, offer: offer.trim(), style, platforms,
        image, videoIds, createdAt: Date.now(),
      }));

      router.push(`/campaign/${seriesId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ غير متوقع. حاول مرة أخرى.');
      setBusy(false);
    }
  }

  return (
    <div dir="rtl" className="studio-root">
      <div className="aurora a1" /><div className="aurora a2" /><div className="aurora a3" /><div className="grain" />
      <CampaignHeader />
      <main className="shell" style={{ paddingTop: 24, maxWidth: 880 }}>
        {/* progress */}
        <div className="row" style={{ gap: 8, marginBottom: 26, flexWrap: 'wrap' }}>
          {STEP_TITLES.map((t, i) => (
            <button
              key={t}
              onClick={() => !busy && i < step && setStep(i)}
              className={`chip ${i === step ? 'on' : ''}`}
              style={{ cursor: i < step ? 'pointer' : 'default', opacity: i <= step ? 1 : 0.45 }}
            >
              {i < step ? <Check size={13} /> : <span>{i + 1}</span>} {t}
            </button>
          ))}
        </div>

        <motion.div key={step} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="glass" style={{ padding: 30 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>🚀 {STEP_TITLES[step]}</h1>
          {step === 2 && <p className="muted" style={{ marginBottom: 18 }}>اكتب اسم منتجك/نشاطك والعرض بصياغة واضحة — ستُبنى عليها كل القطع الإعلانية.</p>}
          {step === 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginTop: 18 }}>
              {TYPES.map(({ id, icon: Icon }) => (
                <button key={id} onClick={() => setType(id)} className="glass hoverable" style={{ padding: 18, border: type === id ? '1.5px solid #D4FF32' : undefined, textAlign: 'center', cursor: 'pointer' }}>
                  <Icon size={26} style={{ marginBottom: 8, opacity: 0.9 }} />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{BUSINESS_TYPE_LABELS[id]}</div>
                </button>
              ))}
            </div>
          )}
          {step === 1 && (
            <div style={{ marginTop: 18 }}>
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); onImage(e.dataTransfer.files?.[0]); }}
                style={{ display: 'grid', placeItems: 'center', gap: 10, padding: '46px 20px', border: '2px dashed rgba(255,255,255,0.22)', borderRadius: 16, cursor: 'pointer', textAlign: 'center' }}
              >
                <input type="file" accept="image/*" hidden onChange={(e) => onImage(e.target.files?.[0])} />
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="صورة المنتج" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 12, objectFit: 'contain' }} />
                ) : (
                  <>
                    <Upload size={34} style={{ opacity: 0.6 }} />
                    <b>اسحب صورة منتجك إلى هنا</b>
                    <span className="sm muted">أو اضغط للاختيار — PNG / JPG (اختياري لكنه يرفع جودة النتيجة)</span>
                  </>
                )}
              </label>
              {image && <button className="chip" style={{ marginTop: 12 }} onClick={() => setImage(null)}>إزالة الصورة</button>}
            </div>
          )}
          {step === 2 && (
            <div style={{ marginTop: 18, display: 'grid', gap: 14 }}>
              <div className="field">
                <label>اسم المنتج / النشاط</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: عطر الصيف" style={{ width: '100%' }} />
              </div>
              <div className="field">
                <label>العرض</label>
                <textarea value={offer} onChange={(e) => setOffer(e.target.value)} rows={3} placeholder="مثال: عطر رجالي فاخر — خصم 30% لمدة 3 أيام" style={{ width: '100%', resize: 'vertical' }} />
              </div>
            </div>
          )}
          {step === 3 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginTop: 18 }}>
              {PLATFORMS.map((p) => (
                <button key={p} onClick={() => togglePlatform(p)} className="glass hoverable" style={{ padding: 16, border: platforms.includes(p) ? '1.5px solid #D4FF32' : undefined, cursor: 'pointer' }}>
                  <div className="row between">
                    <b style={{ fontSize: 14 }}>{PLATFORM_LABELS[p]}</b>
                    {platforms.includes(p) && <Check size={16} color="#D4FF32" />}
                  </div>
                </button>
              ))}
            </div>
          )}
          {step === 4 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
              {STYLES.map((s) => (
                <button key={s} onClick={() => setStyle(s)} className={`chip ${style === s ? 'on' : ''}`} style={{ fontSize: 14, padding: '10px 16px', cursor: 'pointer' }}>
                  {AD_STYLE_LABELS[s]}
                </button>
              ))}
            </div>
          )}

          {err && <div className="alert err" style={{ marginTop: 18 }}>{err}</div>}

          <div className="row between" style={{ marginTop: 26 }}>
            <button className="chip" style={{ visibility: step === 0 ? 'hidden' : 'visible' }} onClick={() => setStep(s => s - 1)} disabled={busy}>
              <ChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} /> السابق
            </button>
            {step < 4 ? (
              <button className="btn btn-primary btn-lg" disabled={!canNext} onClick={() => setStep(s => s + 1)}>التالي</button>
            ) : (
              <button className="btn btn-primary btn-lg" disabled={busy || !canNext} onClick={createCampaign}>
                {busy ? <><Loader2 size={17} className="spin" /> جاري إنشاء الحملة…</> : <><Sparkles size={17} /> أنشئ الحملة</>}
              </button>
            )}
          </div>
          {busy && <p className="sm muted" style={{ marginTop: 14, textAlign: 'center' }}>نجهّز حملتك: سلسلة المحتوى + 3 فيديوهات إعلانية… لا تغلق الصفحة.</p>}
        </motion.div>
      </main>
    </div>
  );
}

export default function CampaignNewPage() {
  return <WizardInner />;
}
