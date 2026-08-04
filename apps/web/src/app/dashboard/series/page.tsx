'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Clapperboard, PlusCircle, Sparkles } from 'lucide-react';
import AppShell from '../../../components/dashboard/app-shell';
import { EmptyState, GlassCard, SectionHeader } from '../../../components/ui/chrome';
import { HoverLift, Reveal } from '../../../components/ui/reveal';
import { api, arabicMessage, ApiProblem } from '../../../lib/api';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

interface Series {
  id: string;
  name: string;
  niche: string;
  language: string;
  targetPlatforms: string[];
  counts: { videos: number };
  createdAt: string;
}

export default function SeriesPage() {
  const { session, ready } = useAuthenticatedSession();
  const [items, setItems] = useState<Series[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [niche, setNiche] = useState('معرفة وحقائق');

  const load = useCallback(async (s: NonNullable<typeof session>) => {
    try {
      const res = await api.get<{ items: Series[] }>(`/v1/organizations/${s.orgId}/series`, s.accessToken);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل السلاسل');
    }
  }, []);

  useEffect(() => {
    if (session?.orgId && !items) void load(session);
  }, [session, items, load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.orgId) return;
    if (name.trim().length < 2) {
      setError('أدخل اسم السلسلة للمتابعة.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/v1/organizations/${session.orgId}/series`, { name: name.trim(), niche }, session.accessToken);
      setName('');
      setItems(null);
      void load(session);
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر إنشاء السلسلة');
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !session) return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;

  return (
    <AppShell session={session} title="Studio" subtitle="Build cinematic content pipelines with a premium project browser and prompt-ready entry points.">
      {error && <div className="alert err">{error}</div>}
      <div className="section-grid two">
        <Reveal>
          <GlassCard>
            <SectionHeader eyebrow="Create New" title="Start a new series." body="Every series becomes an always-on creative pipeline with prompts, assets, rendering and publishing stages." />
            <form onSubmit={create}>
              <div className="field"><label htmlFor="sname">Series name</label><input id="sname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Space myths / Brand explainers / Daily insights" /></div>
              <div className="field"><label htmlFor="sniche">Niche</label><select id="sniche" value={niche} onChange={(e) => setNiche(e.target.value)}><option>معرفة وحقائق</option><option>تقنية وذكاء اصطناعي</option><option>تحفيز وتطوير ذات</option><option>مال وأعمال</option><option>صحة ولياقة</option><option>تاريخ وحضارات</option></select></div>
              <button className="btn btn-primary" disabled={busy} type="submit"><PlusCircle size={18} /> {busy ? 'Creating…' : 'Create Series'}</button>
            </form>
          </GlassCard>
        </Reveal>
        <Reveal delay={0.08}>
          <GlassCard>
            <SectionHeader eyebrow="Studio Intent" title="Prompt-led production, refined by design." body="Use this space like an AI-native video studio: create a series, open its workspace, then drive generation, assets and publishing from one elegant flow." />
            <div className="section-grid two">
              <div className="glass-card"><h3>Prompt Builder</h3><p>Series detail doubles as your prompt and output studio.</p></div>
              <div className="glass-card"><h3>Recent Outputs</h3><p>Generated videos remain attached to the series for iterative improvement.</p></div>
            </div>
          </GlassCard>
        </Reveal>
      </div>

      <Reveal>
        <GlassCard>
          <SectionHeader eyebrow="Recent Projects" title="Your series library." body="Browse live creative pipelines and jump directly into the studio detail view." />
          {items === null ? (
            <div className="section-grid three">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="glass-card skeleton" style={{ minHeight: 200 }} />)}</div>
          ) : items.length === 0 ? (
            <EmptyState title="No series yet" body="Create the first series above, then open it to build prompts, generate videos and manage publishing." />
          ) : (
            <div className="media-grid">
              {items.map((series, index) => (
                <Reveal key={series.id} delay={index * 0.04}>
                  <HoverLift>
                    <Link href={`/dashboard/series/detail/?id=${series.id}`} className="glass-card" style={{ display: 'block' }}>
                      <div className="feature-icon"><Clapperboard size={22} /></div>
                      <p className="eyebrow subtle">{series.language}</p>
                      <h3>{series.name}</h3>
                      <p>{series.niche}</p>
                      <div className="row" style={{ marginTop: 16 }}>
                        <span className="stat-chip stat-plain"><Sparkles size={14} /> {series.counts.videos} videos</span>
                        <span className="stat-chip stat-plain">{series.targetPlatforms.join(', ')}</span>
                      </div>
                    </Link>
                  </HoverLift>
                </Reveal>
              ))}
            </div>
          )}
        </GlassCard>
      </Reveal>
    </AppShell>
  );
}
