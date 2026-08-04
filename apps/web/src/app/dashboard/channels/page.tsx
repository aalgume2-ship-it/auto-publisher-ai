'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RadioTower, Sparkles, Unplug } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import AppShell from '../../../components/dashboard/app-shell';
import { EmptyState, GlassCard, SectionHeader } from '../../../components/ui/chrome';
import { HoverLift, Reveal } from '../../../components/ui/reveal';
import { api, arabicMessage, ApiProblem } from '../../../lib/api';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

interface Channel {
  id: string;
  platform: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  status: string;
  followers: string | null;
  connectedAt: string;
}

function ConfigNotice({ detail }: { detail: string }) {
  return <div className="alert err">{detail}</div>;
}

function ChannelsInner() {
  const params = useSearchParams();
  const { session, ready } = useAuthenticatedSession();
  const [items, setItems] = useState<Channel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configDetail, setConfigDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const linked = params?.get('linked');
  const linkedName = params?.get('name');

  const load = useCallback(async (s: NonNullable<typeof session>) => {
    try {
      const res = await api.get<{ items: Channel[] }>(`/v1/organizations/${s.orgId}/channels`, s.accessToken);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل القنوات');
    }
  }, []);

  useEffect(() => {
    if (session?.orgId && !items) void load(session);
  }, [session, items, load]);

  async function link() {
    if (!session?.orgId) return;
    setBusy('link');
    setError(null);
    setConfigDetail(null);
    try {
      const res = await api.post<{ authorizeUrl: string }>(`/v1/organizations/${session.orgId}/channels/youtube/link`, {}, session.accessToken);
      window.location.href = res.authorizeUrl;
    } catch (e) {
      if (e instanceof ApiProblem && e.status === 503) setConfigDetail(e.body.detail ?? 'YouTube OAuth client is not configured on this server yet.');
      else setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر بدء الربط');
      setBusy(null);
    }
  }

  async function disconnect(id: string) {
    if (!session?.orgId) return;
    setBusy(id);
    try {
      await api.del(`/v1/organizations/${session.orgId}/channels/${id}`, session.accessToken);
      setItems((arr) => (arr ?? []).filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر فصل القناة');
    } finally {
      setBusy(null);
    }
  }

  if (!ready || !session) return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;

  return (
    <AppShell
      session={session}
      title="Channels"
      subtitle="Wire your distribution endpoints with a polished, production-grade channel manager."
      actions={<button className="btn btn-primary" onClick={link} disabled={busy === 'link'}><RadioTower size={18} /> {busy === 'link' ? 'Opening…' : 'Connect YouTube'}</button>}
    >
      {linked && <div className="alert ok">Connected successfully{linkedName ? `: ${linkedName}` : ''}.</div>}
      {configDetail && <ConfigNotice detail={configDetail} />}
      {error && <div className="alert err">{error}</div>}

      <Reveal>
        <GlassCard>
          <SectionHeader eyebrow="Distribution" title="Connected channel destinations." body="A clean control surface for OAuth-backed channels, health state and publishing readiness." />
          {items === null ? (
            <div className="section-grid three">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="glass-card skeleton" style={{ minHeight: 220 }} />)}
            </div>
          ) : items.length === 0 && !configDetail ? (
            <EmptyState title="No channels yet" body="Connect your first YouTube channel to unlock studio publishing and scheduling." action={<button className="btn btn-primary" onClick={link}>Connect Channel</button>} />
          ) : (
            <div className="media-grid">
              {(items ?? []).map((channel, index) => (
                <Reveal key={channel.id} delay={index * 0.04}>
                  <HoverLift>
                    <div className="glass-card">
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div className="row" style={{ gap: 14 }}>
                          {channel.avatarUrl ? <img src={channel.avatarUrl} alt="" width={56} height={56} style={{ borderRadius: 18 }} /> : <div className="avatar-badge">Y</div>}
                          <div>
                            <p className="eyebrow subtle">{channel.platform}</p>
                            <h3>{channel.displayName}</h3>
                            <p>{channel.handle ?? 'Connected account'}</p>
                          </div>
                        </div>
                        <span className={`stat-chip ${channel.status === 'CONNECTED' ? 'stat-ready' : 'stat-busy'}`}>{channel.status}</span>
                      </div>
                      <div className="row" style={{ marginTop: 16 }}>
                        <span className="stat-chip stat-plain"><Sparkles size={14} /> {channel.followers ? `${Number(channel.followers).toLocaleString('en-US')} followers` : 'Ready for publish'}</span>
                        <span className="stat-chip stat-plain">Since {new Date(channel.connectedAt).toLocaleDateString('en-GB')}</span>
                      </div>
                      <div className="row" style={{ justifyContent: 'space-between', marginTop: 18 }}>
                        <Link className="btn btn-ghost" href="/dashboard/series/">Open Studio</Link>
                        <button className="btn btn-ghost" onClick={() => void disconnect(channel.id)} disabled={busy === channel.id}><Unplug size={16} /> {busy === channel.id ? 'Disconnecting…' : 'Disconnect'}</button>
                      </div>
                    </div>
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

export default function Page() {
  return <Suspense fallback={<div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Loading channels…</div></div>}><ChannelsInner /></Suspense>;
}
