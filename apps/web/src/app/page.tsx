'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, ArrowLeft, Play, Image as ImageIcon, Type, Film, Smartphone } from 'lucide-react';
import { buildCampaignPackage } from '../lib/campaign-copy';

const PLATFORMS = ['Instagram', 'TikTok', 'Snapchat', 'WhatsApp', 'Facebook', 'YouTube Shorts'];

// Live sample: the demo package rendered on the landing page itself.
const SAMPLE = buildCampaignPackage({
  name: 'عطر الصيف',
  type: 'product',
  offer: 'عطر رجالي فاخر — خصم 30% لمدة 3 أيام',
  style: 'luxury',
  platforms: ['instagram', 'tiktok', 'snapchat'],
});

export default function Home() {
  return (
    <div dir="rtl" lang="ar" className="studio-root" style={{ minHeight: '100vh' }}>
      <div className="aurora a1" /><div className="aurora a2" /><div className="aurora a3" /><div className="grain" />

      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(14px)', background: 'rgba(8,8,14,0.72)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 20px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 17, textDecoration: 'none', color: 'inherit' }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,#D4FF32,#7C5CFF)', color: '#0a0a10' }}><Sparkles size={16} /></span>
            Lumen
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <Link href="/campaign/new" style={{ padding: '8px 12px', borderRadius: 10, fontSize: 14, textDecoration: 'none', color: 'inherit' }}>إنشاء حملة</Link>
            <Link href="/campaigns" style={{ padding: '8px 12px', borderRadius: 10, fontSize: 14, textDecoration: 'none', color: 'inherit' }}>حملاتي</Link>
            <Link href="/presets" style={{ padding: '8px 12px', borderRadius: 10, fontSize: 14, textDecoration: 'none', color: 'inherit' }}>القوالب</Link>
          </nav>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/login" className="chip" style={{ textDecoration: 'none', fontSize: 13 }}>دخول</Link>
            <Link href="/campaign/new" className="btn btn-primary" style={{ fontSize: 13, textDecoration: 'none', padding: '8px 14px' }}>ابدأ مجانًا</Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '0 20px' }}>
        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '86px 0 40px' }}>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="pill-note" style={{ display: 'inline-block', marginBottom: 20 }}>Lumen — AI Marketing Studio</span>
            <h1 style={{ fontSize: 'clamp(38px, 6vw, 72px)', fontWeight: 800, lineHeight: 1.08, margin: 0 }}>
              عندك منتج؟
              <br />
              <span style={{ background: 'linear-gradient(120deg,#D4FF32,#9dff5c 40%,#7C5CFF)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>خلّنا نسوّق له.</span>
            </h1>
            <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.8, color: 'var(--text-soft, #b9b9c6)', maxWidth: 640, margin: '22px auto 0' }}>
              ارفع صورة منتجك، اكتب العرض، واختر المنصة —
              <br />
              Lumen ينشئ لك الإعلان، الفيديو، النص، التصميم والكابشن.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 34, flexWrap: 'wrap' }}>
              <Link href="/campaign/new" className="btn btn-primary btn-lg" style={{ textDecoration: 'none', fontSize: 17 }}>
                ابدأ حملتك مجانًا <ArrowLeft size={18} />
              </Link>
              <a href="#example" className="btn btn-lg" style={{ textDecoration: 'none', fontSize: 17, border: '1px solid rgba(255,255,255,0.18)' }}>
                <Play size={16} /> شاهد مثالاً
              </a>
            </div>
            <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 36, flexWrap: 'wrap' }}>
              {PLATFORMS.map((p) => (
                <span key={p} className="chip" style={{ pointerEvents: 'none', fontSize: 13 }}>{p}</span>
              ))}
            </div>
          </motion.div>
        </section>

        {/* 1 product → 20 assets */}
        <section style={{ padding: '56px 0' }}>
          <div style={{ textAlign: 'center', marginBottom: 34 }}>
            <span className="section-tag">الميزة الأساسية</span>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, marginTop: 12 }}>
              منتج واحد <span style={{ color: '#D4FF32' }}>&larr;</span> <span style={{ color: '#D4FF32' }}>20</span> قطعة إعلانية
            </h2>
            <p style={{ color: 'var(--text-soft, #b9b9c6)', maxWidth: 560, margin: '12px auto 0', lineHeight: 1.8 }}>
              ارفع صورة واحدة فقط — Lumen يحوّلها إلى هوكات وفيديوهات وتصاميم وكابشنز جاهزة للنشر.
            </p>
          </div>
          <div className="loader-cards">
            {[
              { icon: Type, n: '5', t: 'هوكات', d: 'أول 3 ثوانٍ توقف التمرير' },
              { icon: Film, n: '5', t: 'فيديوهات', d: 'إعلانات 9:16 بأساليب مختلفة' },
              { icon: ImageIcon, n: '5', t: 'تصاميم', d: 'بوست وستوري وسناب' },
              { icon: Smartphone, n: '5', t: 'كابشنز', d: 'نصوص لكل منصة' },
            ].map(({ icon: Icon, n, t, d }) => (
              <div key={t} className="glass hoverable" style={{ padding: 24, textAlign: 'center' }}>
                <Icon size={26} style={{ opacity: 0.8, marginBottom: 10 }} />
                <div style={{ fontSize: 40, fontWeight: 800, color: '#D4FF32', lineHeight: 1 }}>{n}</div>
                <div style={{ fontWeight: 800, fontSize: 16, margin: '6px 0 4px' }}>{t}</div>
                <div className="sm muted">{d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section style={{ padding: '40px 0' }}>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <span className="section-tag">كيف تشتغل؟</span>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 800, marginTop: 12 }}>ثلاث خطوات وتنتهي</h2>
          </div>
          <div className="loader-cards">
            {[
              { n: '1', t: 'صوّر منتجك', d: 'ارفع صورة واحدة واكتب عرضك: «عطر رجالي — 149 ريال — شحن مجاني»' },
              { n: '2', t: 'اختر المنصات والأسلوب', d: 'انستقرام، تيك توك، سناب… فاخر أو شبابي أو سعودي' },
              { n: '3', t: 'استلم حملتك', d: 'فيديوهات + تصاميم + نصوص + كابشن + هاشتاقات + رسالة واتساب' },
            ].map(({ n, t, d }) => (
              <div key={n} className="glass" style={{ padding: 24 }}>
                <div style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#D4FF32,#9dff5c)', color: '#0a0a10', fontWeight: 800, fontSize: 18, marginBottom: 12 }}>{n}</div>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{t}</div>
                <p className="sm muted" style={{ lineHeight: 1.7 }}>{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Live example */}
        <section id="example" className="glass" style={{ padding: '34px 28px', margin: '30px 0', borderRadius: 22 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <span className="section-tag">مثال حقيقي</span>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 800, marginTop: 12 }}>حملة: عطر الصيف ⌛</h2>
            <p className="muted" style={{ marginTop: 8 }}>هذه حزمة مولّدة فعلًا من Lumen — نفس ما ستستلمه بعد إنشاء حملتك</p>
          </div>
          <div className="loader-cards">
            <div className="glass" style={{ padding: 18 }}>
              <b style={{ display: 'block', marginBottom: 10 }}>🪝 هوكات</b>
              {SAMPLE.hooks.slice(0, 3).map((h, i) => <p key={i} className="sm" style={{ lineHeight: 1.7, marginBottom: 6 }}>• {h}</p>)}
            </div>
            <div className="glass" style={{ padding: 18 }}>
              <b style={{ display: 'block', marginBottom: 10 }}>✍️ نص إعلاني</b>
              <p className="sm" style={{ lineHeight: 1.8 }}>{SAMPLE.adTexts[0]}</p>
            </div>
            <div className="glass" style={{ padding: 18 }}>
              <b style={{ display: 'block', marginBottom: 10 }}>📱 كابشن</b>
              <p className="sm" style={{ lineHeight: 1.8, whiteSpace: 'pre-line' }}>{SAMPLE.captions[0]}</p>
            </div>
            <div className="glass" style={{ padding: 18 }}>
              <b style={{ display: 'block', marginBottom: 10 }}>#️⃣ هاشتاقات</b>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {SAMPLE.hashtags.slice(0, 8).map((h) => <span key={h} className="chip" style={{ pointerEvents: 'none', fontSize: 11 }}>{h}</span>)}
              </div>
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(212,255,50,0.1)', border: '1px solid rgba(212,255,50,0.25)', fontSize: 13 }}>
                💬 {SAMPLE.whatsappMessage.split('\n')[0]}
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section style={{ textAlign: 'center', padding: '70px 0 90px' }}>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, lineHeight: 1.2 }}>
            صوّر منتجك. اكتب عرضك.
            <br />
            <span style={{ background: 'linear-gradient(120deg,#D4FF32,#7C5CFF)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Lumen يصنع حملتك.</span>
          </h2>
          <Link href="/campaign/new" className="btn btn-primary btn-lg" style={{ textDecoration: 'none', fontSize: 18, marginTop: 28, display: 'inline-flex' }}>
            <Sparkles size={18} /> ابدأ حملتك مجانًا
          </Link>
          <p className="sm muted" style={{ marginTop: 14 }}>لا حاجة لبطاقة — جرّب الآن</p>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '26px 20px', textAlign: 'center' }}>
        <span className="sm muted">Lumen — AI Marketing Studio · حوّل منتجك إلى حملة تسويقية كاملة بالذكاء الاصطناعي</span>
      </footer>
    </div>
  );
}
