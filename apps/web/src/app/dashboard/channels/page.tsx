'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RadioTower, Sparkles, Unplug, Video, Music2 } from 'lucide-react';
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

  async function linkYouTube() {
    if (!session?.orgId) return;
    setBusy('yt');
    setError(null);
    setConfigDetail(null);
    try {
      const res = await api.post<{ authorizeUrl: string }>(`/v1/organizations/${session.orgId}/channels/youtube/link`, {}, session.accessToken);
      window.location.href = res.authorizeUrl;
    } catch (e) {
      if (e instanceof ApiProblem && e.status === 503) setConfigDetail(e.body.detail ?? 'YouTube OAuth client is not configured on this server yet.');
      else setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر بدء ربط YouTube');
      setBusy(null);
    }
  }

  async function linkTikTok() {
    if (!session?.orgId) return;
    setBusy('tt');
    setError(null);
    setConfigDetail(null);
    try {
      const res = await api.post<{ authorizeUrl: string }>(`/v1/organizations/${session.orgId}/channels/tiktok/link`, {}, session.accessToken);
      window.location.href = res.authorizeUrl;
    } catch (e) {
      if (e instanceof ApiProblem && e.status === 503) setConfigDetail(e.body.detail ?? 'TikTok OAuth client is not configured on this server yet.');
      else setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر بدء ربط TikTok');
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

  const tiktokConnected = items?.some(c => c.platform === 'tiktok') ?? false;

  if (!ready || !session) return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;

  return (
    <AppShell
      session={session}
      title="Channels"
      subtitle="Connect YouTube & TikTok — real OAuth, encrypted vault, publishing-ready in seconds."
      actions={
        <div className="row">
          <button className="btn btn-ghost" onClick={linkTikTok} disabled={busy === 'tt'}><Music2 size={18} /> {busy === 'tt' ? 'Opening…' : tiktokConnected ? 'Connect TikTok +' : 'Connect TikTok'}</button>
          <button className="btn btn-primary" onClick={linkYouTube} disabled={busy === 'yt'}><RadioTower size={18} /> {busy === 'yt' ? 'Opening…' : 'Connect YouTube'}</button>
        </div>
      }
    >
      {linked && <div className="alert ok">Connected successfully{linkedName ? `: ${linkedName}` : ''} — platform: {linked}.</div>}
      {configDetail && <ConfigNotice detail={configDetail} />}
      {error && <div className="alert err">{error}</div>}

      <Reveal>
        <GlassCard>
          <SectionHeader eyebrow="Distribution" title="Connected channel destinations." body="A clean control surface for OAuth-backed channels, health state and publishing readiness. Provider-isolated — adding Instagram/Facebook is a single new publisher module." />
          {items === null ? (
            <div className="section-grid three">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="glass-card skeleton" style={{ minHeight: 220 }} />)}
            </div>
          ) : items.length === 0 && !configDetail ? (
            <EmptyState title="No channels yet" body="Connect your first YouTube or TikTok channel to unlock studio publishing and scheduling." action={
              <div className="row">
                <button className="btn btn-primary" onClick={linkYouTube}>Connect YouTube</button>
                <button className="btn btn-ghost" onClick={linkTikTok}><Music2 size={16}/> TikTok</button>
              </div>
            } />
          ) : (
            <div className="media-grid">
              {(items ?? []).map((channel, index) => (
                <Reveal key={channel.id} delay={index * 0.04}>
                  <HoverLift>
                    <div className="glass-card" style={{ borderColor: channel.platform === 'tiktok' ? 'rgba(0,0,0,0.2)' : undefined }}>
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div className="row" style={{ gap: 14 }}>
                          {channel.avatarUrl ? <img src={channel.avatarUrl} alt="" width={56} height={56} style={{ borderRadius: 18, objectFit: 'cover' }} /> : <div className="avatar-badge" style={{ background: channel.platform === 'tiktok' ? '#000' : undefined }}>{channel.platform === 'tiktok' ? '♪' : 'Y'}</div>}
                          <div>
                            <p className="eyebrow subtle">{channel.platform === 'tiktok' ? 'TikTok' : channel.platform}</p>
                            <h3>{channel.displayName}</h3>
                            <p>{channel.handle ?? 'Connected account'}</p>
                          </div>
                        </div>
                        <span className={`stat-chip ${channel.status === 'CONNECTED' ? 'stat-ready' : channel.status === 'TOKEN_EXPIRED' ? 'stat-fail' : 'stat-busy'}`}>{channel.status}</span>
                      </div>
                      <div className="row" style={{ marginTop: 16 }}>
                        <span className="stat-chip stat-plain"><Sparkles size={14} /> {channel.followers ? `${Number(channel.followers).toLocaleString('en-US')} followers` : 'Ready for publish'}</span>
                        <span className="stat-chip stat-plain">{channel.platform === 'tiktok' ? <Music2 size={12}/> : <Video size={12}/>} {channel.platform}</span>
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

      <Reveal delay={0.06}>
        <div className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ display:'flex', alignItems:'center', gap:8 }}><Music2 size={18} style={{ color:'var(--accent)'}}/> TikTok — Real Publishing (Content Posting API v2)</h3>
          <p style={{ color:'var(--text-soft)', marginTop:8 }}>OAuth via PKCE (required by TikTok), video upload (FILE_UPLOAD → PUT), captions & privacy settings, publish status polling. Credentials in env or org vault (encrypted at rest). All secrets in Environment Variables only — nothing in Git.</p>
          <p style={{ color:'var(--muted)', fontSize:13, marginTop:8 }}>Env: <code>TIKTOK_CLIENT_KEY</code> + <code>TIKTOK_CLIENT_SECRET</code> · Callback: <code>/v1/channels/oauth/tiktok/callback</code> (set in TikTok Developers → Login Kit → Redirect URI)</p>
        </div>
      </Reveal>
    </AppShell>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Loading channels…</div></div>}><ChannelsInner /></Suspense>;
}
