'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Check, ExternalLink, Loader2 } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { listBrowserProviders, byCategory, type ProviderInfo } from '../../lib/provider-status';
import { loadStudioSession } from '../../lib/studio-session';

const PLANS = [
  { code: 'free', name: 'Free', price: '$0', blurb: 'Try the studio.', items: ['Watermarked renders', '720p max', '3 generations / day'] },
  { code: 'pro', name: 'Pro', price: '$12', blurb: 'For serious creators.', items: ['Unlimited renders', '4K output', 'Priority pipeline', 'No watermark'], featured: true },
  { code: 'studio', name: 'Studio', price: '$39', blurb: 'For teams and agencies.', items: ['Unlimited + API access', 'Team seats', 'Brand styles', 'Dedicated support'] },
];

export default function BillingPage() {
  const [stripe, setStripe] = useState<ProviderInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<string>('free');
  const session = typeof window !== 'undefined' ? loadStudioSession() : null;

  useEffect(() => {
    const found = byCategory(listBrowserProviders(), 'billing').find((p) => p.id === 'stripe');
    setStripe(found ?? null);
  }, []);

  async function subscribe(planCode: string) {
    setError(null);
    if (!stripe || stripe.status !== 'configured') {
      setError(
        'Stripe is not configured on the server. Add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PUBLISHABLE_KEY to the API env to enable real billing.',
      );
      return;
    }
    if (!session || !session.tokens?.accessToken || !session.orgId) {
      setError('Sign in to subscribe.');
      return;
    }
    setBusy(planCode);
    try {
      const api = await import('../../lib/studio-api');
      const r = await api.createCheckout(session.tokens.accessToken, session.orgId, planCode, '/billing/success');
      if (r.ok && r.data?.url) {
        window.location.href = r.data.url;
      } else {
        setError(r.error?.detail ?? 'Failed to start checkout.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ paddingTop: 20, maxWidth: 980 }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800 }}>Billing</h1>
          <p className="muted">Pick a plan. Cancel anytime. Powered by Stripe.</p>
        </div>

        {!stripe || stripe.status !== 'configured' ? (
          <div
            className="glass"
            style={{
              padding: 16,
              marginBottom: 16,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <AlertCircle size={18} style={{ color: 'var(--accent-strong)', marginTop: 2 }} />
            <div className="sm" style={{ flex: 1 }}>
              <strong>Billing is not configured.</strong> Add <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code>, and <code>STRIPE_PUBLISHABLE_KEY</code> to the API server env, then redeploy. The buttons below will only work once Stripe is wired up.
              <div style={{ marginTop: 6 }}>
                <a className="btn btn-ghost sm" href="/api/v1/health/providers" target="_blank" rel="noreferrer">
                  <ExternalLink size={12} /> Check provider status
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="glass"
            style={{
              padding: 14,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Check size={16} style={{ color: 'var(--accent-strong)' }} />
            <div className="sm">Stripe is configured on the server.</div>
          </div>
        )}

        {error && (
          <div
            className="sm"
            style={{
              padding: 12,
              borderRadius: 10,
              background: 'rgba(255,180,180,0.08)',
              color: '#ffb4b4',
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 14,
          }}
        >
          {PLANS.map((p) => (
            <motion.div
              key={p.code}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass"
              style={{
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                borderColor: p.featured ? 'rgba(212,255,50,0.5)' : undefined,
                boxShadow: p.featured ? '0 0 0 1px rgba(212,255,50,0.35), 0 24px 70px rgba(212,255,50,0.12)' : undefined,
              }}
            >
              {p.featured && (
                <span
                  className="chip"
                  style={{
                    background: 'var(--accent-strong)',
                    color: '#0b0d0a',
                    fontWeight: 800,
                    alignSelf: 'flex-start',
                    padding: '4px 10px',
                  }}
                >
                  Most popular
                </span>
              )}
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-strong)' }}>{p.name.toUpperCase()}</div>
                <div style={{ fontSize: 36, fontWeight: 800, marginTop: 4 }}>
                  {p.price}
                  <span className="sm muted" style={{ fontSize: 13, fontWeight: 400 }}>
                    {' '}
                    / mo
                  </span>
                </div>
                <p className="sm muted" style={{ marginTop: 4 }}>
                  {p.blurb}
                </p>
              </div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, listStyle: 'none', padding: 0 }}>
                {p.items.map((it) => (
                  <li key={it} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 13, opacity: 0.9 }}>
                    <Check size={14} style={{ marginTop: 3, color: 'var(--accent-strong)' }} /> {it}
                  </li>
                ))}
              </ul>
              <button
                className={p.featured ? 'btn btn-primary btn-lg' : 'btn btn-ghost btn-lg'}
                onClick={() => subscribe(p.code)}
                disabled={busy === p.code || current === p.code}
                style={{ marginTop: 'auto' }}
              >
                {busy === p.code ? (
                  <Loader2 size={14} className="spin" />
                ) : current === p.code ? (
                  'Current plan'
                ) : (
                  <>
                    {p.code === 'free' ? 'Stay on free' : `Subscribe to ${p.name}`}
                  </>
                )}
              </button>
            </motion.div>
          ))}
        </div>

        <p className="sm muted" style={{ marginTop: 18 }}>
          Stripe webhooks update <code>Organization.plan</code> and provision credits automatically. Cancel from the Stripe customer portal (link emailed on signup).
        </p>
      </main>
    </div>
  );
}
