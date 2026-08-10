'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plug,
  Unplug,
} from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { listBrowserProviders, byCategory, type ProviderInfo } from '../../lib/provider-status';

interface Connection {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  provider: 'youtube' | 'tiktok' | 'instagram';
  scope: string;
}

const PLATFORMS: Connection[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    description: 'Upload long-form videos and Shorts. Title, description, tags, thumbnail, and privacy are sent on publish.',
    icon: <YouTubeIcon />,
    provider: 'youtube',
    scope: 'youtube.upload, youtube.readonly, yt-analytics.readonly',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    description: 'Post to TikTok via the Content Posting API. Requires approved creator or business app.',
    icon: <TikTokIcon />,
    provider: 'tiktok',
    scope: 'user.info.basic, video.publish, video.upload',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    description: 'Publish to Reels and feed via the Graph API. Requires a Business or Creator account linked to a Facebook Page.',
    icon: <InstagramIcon />,
    provider: 'instagram',
    scope: 'instagram_basic, instagram_content_publish, pages_show_list',
  },
];

export default function ConnectionsPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState<{ [k: string]: boolean }>({});
  const [status, setStatus] = useState<{ [k: string]: string | null }>({});
  const [connections, setConnections] = useState<{ [k: string]: { displayName?: string } }>({});

  useEffect(() => {
    setProviders(byCategory(listBrowserProviders(), 'social'));
  }, []);

  function statusFor(p: 'youtube' | 'tiktok' | 'instagram'): ProviderInfo | undefined {
    return providers.find((x) => x.id === p);
  }

  function handleConnect(platform: Connection) {
    const info = statusFor(platform.provider);
    if (!info || info.status !== 'configured') {
      setStatus((s) => ({
        ...s,
        [platform.provider]: `OAuth app is not configured on the server. Add the ${info?.envKeys.join(' + ') ?? 'env vars'} to enable real connections.`,
      }));
      return;
    }
    // Real OAuth start: redirect to backend /v1/oauth/:provider/start.
    // The backend redirects to the provider's auth URL with state and PKCE.
    setLoading((l) => ({ ...l, [platform.provider]: true }));
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';
    const returnTo = encodeURIComponent(window.location.origin + '/connections');
    window.location.href = `${apiBase}/oauth/${platform.provider}/start?return_to=${returnTo}`;
  }

  function handleDisconnect(platform: Connection) {
    // Real disconnect: call /v1/oauth/:provider/disconnect.
    setLoading((l) => ({ ...l, [platform.provider]: true }));
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';
    void fetch(`${apiBase}/oauth/${platform.provider}/disconnect`, { method: 'POST' })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        setLoading((l) => ({ ...l, [platform.provider]: false }));
        setConnections((c) => {
          const next = { ...c };
          delete next[platform.provider];
          return next;
        });
        setStatus((s) => ({ ...s, [platform.provider]: null }));
      });
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ paddingTop: 20, maxWidth: 980 }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800 }}>Connections</h1>
          <p className="muted">Link your social accounts to publish directly from AutoCreator AI.</p>
        </div>

        <div
          className="glass"
          style={{
            padding: 14,
            marginBottom: 16,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <AlertCircle size={16} style={{ marginTop: 2, color: 'var(--accent-strong)' }} />
          <div className="sm">
            Each platform requires an OAuth app registered on its developer portal and the corresponding client ID/secret added to the API server env. The cards below show whether the integration is configured — only configured platforms can be connected.
            <div style={{ marginTop: 6 }}>
              <a className="btn btn-ghost sm" href="/api/v1/health/providers" target="_blank" rel="noreferrer">
                <ExternalLink size={12} /> Check provider status
              </a>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {PLATFORMS.map((p) => {
            const info = statusFor(p.provider);
            const configured = info?.status === 'configured';
            const connected = !!connections[p.provider];
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass"
                style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        background: 'rgba(255,255,255,0.04)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      {p.icon}
                    </div>
                    <div>
                      <h2 style={{ fontSize: 17, fontWeight: 800 }}>{p.label}</h2>
                      <p className="sm muted" style={{ marginTop: 2 }}>
                        {connected ? `Connected as ${connections[p.provider]?.displayName ?? 'account'}` : 'Not connected'}
                      </p>
                    </div>
                  </div>
                  <StatusPill configured={configured} connected={connected} />
                </div>
                <p className="sm" style={{ opacity: 0.85 }}>
                  {p.description}
                </p>
                <p className="sm muted" style={{ fontSize: 11 }}>
                  Scopes: {p.scope}
                </p>
                {status[p.provider] && (
                  <div
                    className="sm"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: 'rgba(255,180,180,0.08)',
                      color: '#ffb4b4',
                    }}
                  >
                    {status[p.provider]}
                  </div>
                )}
                <div className="row" style={{ gap: 8, marginTop: 'auto' }}>
                  {connected ? (
                    <>
                      <button
                        className="btn btn-ghost"
                        onClick={() => handleConnect(p)}
                        disabled={loading[p.provider]}
                      >
                        {loading[p.provider] ? <Loader2 size={14} className="spin" /> : <Plug size={14} />}
                        Reconnect
                      </button>
                      <button className="btn btn-ghost" onClick={() => handleDisconnect(p)} disabled={loading[p.provider]}>
                        <Unplug size={14} /> Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => handleConnect(p)}
                      disabled={!configured || loading[p.provider]}
                      title={!configured ? 'Not configured on the server' : ''}
                    >
                      {loading[p.provider] ? <Loader2 size={14} className="spin" /> : <Plug size={14} />}
                      Connect
                    </button>
                  )}
                  {info?.consoleUrl && (
                    <a
                      className="btn btn-ghost sm"
                      href={info.consoleUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 12 }}
                    >
                      <ExternalLink size={12} /> Console
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function StatusPill({ configured, connected }: { configured: boolean; connected: boolean }) {
  if (connected) {
    return (
      <span
        className="chip"
        style={{
          background: 'rgba(61,255,192,0.12)',
          color: '#bfffe9',
          fontSize: 11,
          padding: '4px 8px',
        }}
      >
        <CheckCircle2 size={11} /> Live
      </span>
    );
  }
  if (configured) {
    return (
      <span
        className="chip"
        style={{
          background: 'rgba(212,255,50,0.12)',
          color: 'var(--accent-strong)',
          fontSize: 11,
          padding: '4px 8px',
        }}
      >
        Ready
      </span>
    );
  }
  return (
    <span
      className="chip"
      style={{
        background: 'rgba(255,255,255,0.06)',
        color: '#a1a1aa',
        fontSize: 11,
        padding: '4px 8px',
      }}
    >
      Not configured
    </span>
  );
}

function YouTubeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23.5 12 31 31 0 0 0 23 7.2zM9.7 15.5V8.5l6 3.5-6 3.5z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.5 6.5a5.5 5.5 0 0 1-3.5-1.3V16a5 5 0 1 1-5-5v3a2 2 0 1 0 2 2V2h3a5.5 5.5 0 0 0 3.5 4.5v0z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}
