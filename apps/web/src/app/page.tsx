'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Cpu, Layers, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import StudioNav, { Logo } from '../components/studio/StudioNav';
import CreatePanel from '../components/studio/CreatePanel';
import { saveDraft, loadDraft, type CreateDraft } from '../lib/create';

const FEATURES = [
  { icon: Zap, t: 'Renders in seconds', d: 'Self-contained studio engine — no queues with other customers, no cold starts, instant first frame.' },
  { icon: Layers, t: 'Total creative control', d: 'Model, style, aspect ratio and duration tuned before you render — your prompt, your way.' },
  { icon: Cpu, t: 'Real output, real files', d: 'Every render is encoded to a genuine video file you can download, share and remix.' },
  { icon: ShieldCheck, t: 'Private by default', d: 'Generation runs locally in your browser — your ideas never leave your machine.' },
];

const PLANS = [
  { name: 'Free', price: '$0', blurb: 'For trying the studio.', items: ['3 renders / day', '720p output', 'All models'], featured: false },
  { name: 'Pro', price: '$12', blurb: 'For serious creators.', items: ['Unlimited renders', '4K output', 'Priority pipeline', 'No watermark'], featured: true },
  { name: 'Studio', price: '$39', blurb: 'For teams and agencies.', items: ['Unlimited + API', 'Team seats', 'Brand styles', 'Dedicated support'], featured: false },
];

export default function Landing() {
  const router = useRouter();

  function handleGenerate(d: CreateDraft) {
    saveDraft(d);
    // /generate owns the full gating + real-API/fallback orchestration.
    router.push('/generate');
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="aurora a3" />
      <div className="grain" />
      <StudioNav />

      <main className="shell">
        <section className="hero">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="badge"><Sparkles size={14} /> Lumen Studio · AI video from a single prompt</span>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }}>
            Turn one prompt into a <span className="grad">cinematic video.</span>
          </motion.h1>
          <motion.p className="sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.15 }}>
            Choose a model, set the style and aspect, describe your scene, and watch it render live — then download, upscale or remix in one click.
          </motion.p>
          <motion.div className="trust" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.25 }}>
            <span><Check size={14} /> No account to start</span>
            <span><Check size={14} /> Cloud rendering</span>
            <span><Check size={14} /> Real downloadable files</span>
          </motion.div>
        </section>

        <CreatePanel initial={loadDraft()} onGenerate={handleGenerate} />

        <section id="models" style={{ marginTop: 64 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
            <h2 className="h3" style={{ fontSize: 26 }}>Built for every workflow</h2>
            <span className="section-tag">Features</span>
          </div>
          <div className="grid-2">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div key={f.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5, delay: i * 0.05 }} className="glass hoverable" style={{ padding: 22 }}>
                  <div className="row" style={{ marginBottom: 10 }}><span className="pill-note"><Icon size={15} /></span></div>
                  <h3 className="h3">{f.t}</h3>
                  <p className="sm muted" style={{ marginTop: 6 }}>{f.d}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        <section id="pricing" style={{ marginTop: 64 }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <h2 className="h3" style={{ fontSize: 30 }}>Simple, honest pricing</h2>
            <p className="muted" style={{ marginTop: 6 }}>Start free. Upgrade when you need more renders.</p>
          </div>
          <div className="plans">
            {PLANS.map((p) => (
              <motion.div key={p.name} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }} className={`plan glass hoverable ${p.featured ? 'featured' : ''}`}>
                {p.featured && <span className="pill">Most popular</span>}
                <span className="pname">{p.name}</span>
                <div className="price">{p.price}<small>/mo</small></div>
                <p className="muted sm">{p.blurb}</p>
                <ul>{p.items.map((it) => <li key={it}><Check size={15} style={{ color: 'var(--ok)', flexShrink: 0 }} /> {it}</li>)}</ul>
                <Link className={`btn ${p.featured ? 'btn-primary' : 'btn-ghost'} btn-block`} href="/subscribe" style={{ marginTop: 'auto' }}>
                  {p.name === 'Free' ? 'Start free' : `Get ${p.name}`} <ArrowRight size={16} />
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <footer className="sfooter">
        <span><Logo /> <span style={{ opacity: 0.6, marginLeft: 8 }}>© 2026 Lumen Studio</span></span>
        <span className="muted sm">Independent design · no third-party assets</span>
      </footer>
    </div>
  );
}
