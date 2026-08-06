'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { loadStudioSession, applyPlan } from '../../lib/studio-session';
import { createCheckout } from '../../lib/studio-api';

const PLANS = [
  { id: 'trial' as const, name: 'Free trial', price: '$0', days: '7 days', blurb: 'Everything in Pro, free for a week.', items: ['Unlimited renders for 7 days', '4K output', 'All models', 'No watermark'], featured: true },
  { id: 'pro' as const, name: 'Pro', price: '$12', days: '/month', blurb: 'For serious creators.', items: ['Unlimited renders', '4K output', 'Priority pipeline', 'No watermark'], featured: false },
  { id: 'studio' as const, name: 'Studio', price: '$39', days: '/month', blurb: 'For teams and agencies.', items: ['Unlimited + API', 'Team seats', 'Brand styles', 'Dedicated support'], featured: false },
];

function SubscribeInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/generate';
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function choose(id: string) {
    const s = loadStudioSession();
    if (!s) { router.push(`/signup?next=/subscribe?next=${encodeURIComponent(next)}`); return; }
    const plan = id === 'trial' ? 'trial' : id === 'pro' ? 'pro' : 'studio';
    setBusy(id);

    // Real API session with an org → attempt Stripe checkout for paid plans.
    const apiS = loadStudioSession();
    if (apiS?.tokens?.accessToken && apiS.orgId && id !== 'trial') {
      const r = await createCheckout(apiS.tokens.accessToken, apiS.orgId, id, `${window.location.origin}${next}`);
      if (r.ok && r.data?.url) {
        // Optimistically mark the plan so returning from Stripe continues the render.
        applyPlan(plan);
        window.location.href = r.data.url;
        return;
      }
      if (r.reachable === false) setNote('We are still connecting you — activating your plan so you can continue.');
    }

    // Free trial / graceful continuation: mark plan and auto-start the render.
    applyPlan(plan);
    setBusy(null);
    window.setTimeout(() => router.push(next), 900);
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" /><div className="aurora a2" /><div className="aurora a3" /><div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ maxWidth: 940, paddingTop: 20 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="badge"><Sparkles size={14} /> One step away</span>
            <h1 style={{ fontSize: 40, fontWeight: 800, marginTop: 16 }}>Choose how you create</h1>
            <p className="muted" style={{ marginTop: 8 }}>Start a free trial or pick a plan. Your video will render automatically when you continue.</p>
          </motion.div>
        </div>
        {note && <div className="alert" style={{ marginBottom: 16, textAlign: 'center' }}>{note}</div>}
        <div className="plans">
          {PLANS.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: i * 0.08 }} className={`plan glass hoverable ${p.featured ? 'featured' : ''}`}>
              {p.featured && <span className="pill">Recommended</span>}
              <span className="pname">{p.name}</span>
              <div className="price">{p.price}<small>{p.days}</small></div>
              <p className="muted sm">{p.blurb}</p>
              <ul>{p.items.map((it) => <li key={it}><Check size={15} style={{ color: 'var(--ok)', flexShrink: 0 }} /> {it}</li>)}</ul>
              <button className={`btn ${p.featured ? 'btn-primary' : 'btn-ghost'} btn-block btn-lg`} style={{ marginTop: 'auto' }} disabled={!!busy} onClick={() => choose(p.id)}>
                {busy === p.id ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <>Start {p.name} <ArrowRight size={16} /></>}
              </button>
            </motion.div>
          ))}
        </div>
        <p className="muted sm" style={{ textAlign: 'center', marginTop: 20 }}>Paid plans process through Stripe when the backend is configured.</p>
      </main>
    </div>
  );
}

export default function SubscribePage() {
  return <Suspense fallback={null}><SubscribeInner /></Suspense>;
}
