'use client';

import { Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, ExternalLink, Plus, Wand2, X } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { loadStudioSession } from '../../lib/studio-session';
import type { OrgDto } from '../../lib/studio-api';

function CompaniesInner() {
  const [orgs, setOrgs] = useState<OrgDto[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const session = typeof window !== 'undefined' ? loadStudioSession() : null;
  const isGuest = !session;

  useEffect(() => {
    if (isGuest || !session?.tokens?.accessToken) {
      // Show a local "fake" workspace so the user can preview the UI.
      try {
        const raw = window.localStorage.getItem('aca.companies.guest');
        if (raw) setOrgs(JSON.parse(raw) as OrgDto[]);
        else setOrgs([]);
      } catch {
        setOrgs([]);
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      const { listOrgs } = await import('../../lib/studio-api');
      const r = await listOrgs(session.tokens!.accessToken);
      if (!cancelled) setOrgs(r.ok && r.data ? r.data.items.map((m) => m.organization) : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, isGuest]);

  function persistLocal(next: OrgDto[]) {
    try {
      window.localStorage.setItem('aca.companies.guest', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    if (isGuest || !session?.tokens?.accessToken) {
      const local: OrgDto = {
        id: 'co_' + Math.random().toString(36).slice(2, 8),
        name: name.trim(),
        slug: name.trim().toLowerCase().replace(/\s+/g, '-'),
        status: 'ACTIVE',
        timezone: 'Asia/Riyadh',
        defaultLocale: 'en',
      };
      const next = [local, ...(orgs ?? [])];
      setOrgs(next);
      persistLocal(next);
      setName('');
      setCreating(false);
      return;
    }
    try {
      const { createOrg } = await import('../../lib/studio-api');
      const r = await createOrg(session.tokens.accessToken, name.trim());
      if (!r.ok) {
        setError(r.error?.detail ?? 'Failed to create the company.');
        return;
      }
      const next = [r.data!, ...(orgs ?? [])];
      setOrgs(next);
      setName('');
      setCreating(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ paddingTop: 20, maxWidth: 980 }}>
        <div className="row between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800 }}>Companies</h1>
            <p className="muted">Workspaces for each brand. Each has its own library, schedule, and defaults.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> New company
          </button>
        </div>

        {creating && (
          <motion.form
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={createCompany}
            className="glass"
            style={{ padding: 16, marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Brand name (e.g. Lumen Studio)"
              className="chip"
              style={{ flex: 1, padding: '10px 14px', minWidth: 200 }}
            />
            <button className="btn btn-primary" type="submit">
              <Plus size={14} /> Create
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setCreating(false);
                setName('');
                setError(null);
              }}
            >
              <X size={14} /> Cancel
            </button>
          </motion.form>
        )}

        {error && (
          <div className="sm" style={{ color: '#ffb4b4', marginBottom: 10 }}>
            {error}
          </div>
        )}

        {orgs === null ? (
          <div className="loader-cards">
            <div className="skel" style={{ height: 140 }} />
            <div className="skel" style={{ height: 140 }} />
            <div className="skel" style={{ height: 140 }} />
          </div>
        ) : orgs.length === 0 ? (
          <div className="glass" style={{ padding: 40, textAlign: 'center' }}>
            <Briefcase size={28} style={{ opacity: 0.4, marginBottom: 12 }} />
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>No companies yet</h2>
            <p className="muted" style={{ margin: '8px 0 20px' }}>
              Create your first brand workspace to start scheduling content.
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => setCreating(true)}>
              Create your first company
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 14,
            }}
          >
            {orgs.map((o) => (
              <motion.div
                key={o.id}
                whileHover={{ y: -2 }}
                className="glass"
                style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <div className="row between">
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: 'linear-gradient(135deg,#D4FF32,#84cc16)',
                      color: '#0b0d0a',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 800,
                      fontSize: 18,
                    }}
                  >
                    {o.name.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="chip" style={{ pointerEvents: 'none', fontSize: 11 }}>
                    {o.status}
                  </span>
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 800 }}>{o.name}</h2>
                <p className="sm muted">/{o.slug}</p>
                <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <a className="btn btn-ghost sm" href={`/dashboard?org=${o.id}`} style={{ fontSize: 12 }}>
                    Dashboard
                  </a>
                  <a className="btn btn-ghost sm" href={`/library?org=${o.id}`} style={{ fontSize: 12 }}>
                    Library
                  </a>
                  <a className="btn btn-ghost sm" href={`/calendar?org=${o.id}`} style={{ fontSize: 12 }}>
                    Calendar
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {isGuest && (
          <div
            className="glass"
            style={{
              marginTop: 16,
              padding: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Wand2 size={16} style={{ color: 'var(--accent-strong)' }} />
            <div className="sm" style={{ flex: 1 }}>
              Preview mode: companies are saved to your browser only. Sign in to keep them in production.
            </div>
            <a className="btn btn-ghost sm" href="/api/v1/health/providers" target="_blank" rel="noreferrer">
              <ExternalLink size={12} /> Provider status
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={null}>
      <CompaniesInner />
    </Suspense>
  );
}
