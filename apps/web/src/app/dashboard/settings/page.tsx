'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cpu, KeyRound, ShieldEllipsis, Video } from 'lucide-react';
import AppShell from '../../../components/dashboard/app-shell';
import { GlassCard, SectionHeader } from '../../../components/ui/chrome';
import { HoverLift, Reveal } from '../../../components/ui/reveal';
import { API_BASE, api, arabicMessage } from '../../../lib/api';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

interface AiItem {
  id: string;
  label: string;
  model: string;
  free: boolean;
  consoleUrl: string;
  envKey: string;
  configured: boolean;
  source: 'org' | 'env' | null;
  hint: string | null;
  validatedAt: string | null;
  active: boolean;
}
interface VideoItem {
  id: string;
  label: string;
  free: boolean;
  priceHint: string;
  consoleUrl: string;
  envKey: string;
  configured: boolean;
  source: 'org' | 'env' | null;
  hint: string | null;
  validatedAt: string | null;
  active: boolean;
}
interface Integrations {
  ai: { active: { provider: string; source: string } | null; items: AiItem[] };
  video: { active: { provider: string; source: string } | null; items: VideoItem[] };
  youtube: { configured: boolean; source: 'org' | 'env' | null; hint: string | null; redirectUri: string | null };
  tiktok: { configured: boolean; source: 'org' | 'env' | null; hint: string | null; redirectUri: string | null };
}

const PROVIDER_BLURB: Record<string, string> = {
  groq: 'Free, fast and strong for Arabic-first script generation.',
  gemini: 'Accessible model path directly from Google AI Studio.',
  openrouter: 'A unified key for multiple model families.',
  openai: 'Highest quality route for premium output and TTS uplift.',
  pollinations: 'Lightweight free entry point for prompt experimentation.',
};

export default function SettingsPage() {
  const { session, ready } = useAuthenticatedSession();
  const [data, setData] = useState<Integrations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [provider, setProvider] = useState('groq');
  const [apiKey, setApiKey] = useState('');
  const [videoProvider, setVideoProvider] = useState('runway');
  const [videoKey, setVideoKey] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [tiktokKey, setTiktokKey] = useState('');
  const [tiktokSecret, setTiktokSecret] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedTikTok, setCopiedTikTok] = useState(false);

  const load = useCallback(async () => {
    if (!session?.orgId) return;
    try {
      setData(await api.get<Integrations>(`/v1/organizations/${session.orgId}/settings/integrations`, session.accessToken));
      setError(null);
    } catch (e) {
      setError(arabicMessage(e as never));
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const chosen = data?.ai.items.find((i) => i.id === provider) ?? null;
  const chosenVideo = data?.video.items.find((i) => i.id === videoProvider) ?? null;

  const saveKey = async () => {
    if (!session?.orgId || apiKey.trim().length < 8) return setError('ألصق المفتاح كاملاً أولاً');
    setBusy(`ai:${provider}`); setError(null); setNotice(null);
    try {
      const res = await api.put<{ hint: string }>(`/v1/organizations/${session.orgId}/settings/integrations/ai/${provider}`, { apiKey: apiKey.trim() }, session.accessToken);
      setNotice(`تم التحقق من المفتاح لدى ${chosen?.label ?? provider} وحفظه مشفراً (${res.hint}).`);
      setApiKey('');
      await load();
    } catch (e) { setError(arabicMessage(e as never)); }
    finally { setBusy(null); }
  };

  const deleteKey = async (id: string) => {
    if (!session?.orgId) return;
    setBusy(`del:${id}`); setError(null);
    try { await api.del(`/v1/organizations/${session.orgId}/settings/integrations/ai/${id}`, session.accessToken); setNotice('تم حذف المفتاح نهائياً من الخزنة'); await load(); }
    catch (e) { setError(arabicMessage(e as never)); }
    finally { setBusy(null); }
  };

  const saveVideoKey = async () => {
    if (!session?.orgId || videoKey.trim().length < 8) return setError('ألصق مفتاح مزود الفيديو كاملاً أولاً');
    setBusy(`video:${videoProvider}`); setError(null); setNotice(null);
    try {
      await api.put(`/v1/organizations/${session.orgId}/settings/integrations/video/${videoProvider}`, { apiKey: videoKey.trim() }, session.accessToken);
      setNotice(`تُحقق من مفتاح ${chosenVideo?.label} وحُفظ مشفراً — ستُولَّد المشاهد الآن كمقاطع متحركة حقيقية.`);
      setVideoKey('');
      await load();
    } catch (e) { setError(arabicMessage(e as never)); }
    finally { setBusy(null); }
  };

  const deleteVideoKey = async (id: string) => {
    if (!session?.orgId) return;
    setBusy(`vdel:${id}`); setError(null);
    try { await api.del(`/v1/organizations/${session.orgId}/settings/integrations/video/${id}`, session.accessToken); setNotice('حُذف مفتاح الفيديو — سيعود المحرك لوضع المشاهد السينمائية الثابتة'); await load(); }
    catch (e) { setError(arabicMessage(e as never)); }
    finally { setBusy(null); }
  };

  const saveGoogle = async () => {
    if (!session?.orgId || clientId.trim().length < 10 || clientSecret.trim().length < 10) return setError('ألصق Client ID و Client Secret كاملين');
    setBusy('google'); setError(null); setNotice(null);
    try {
      await api.put(`/v1/organizations/${session.orgId}/settings/integrations/oauth/google`, { clientId: clientId.trim(), clientSecret: clientSecret.trim() }, session.accessToken);
      setNotice('تحققت Google من العميل وحُفظ مشفراً — أصبح الربط عبر YouTube جاهزاً.');
      setClientId(''); setClientSecret('');
      await load();
    } catch (e) { setError(arabicMessage(e as never)); }
    finally { setBusy(null); }
  };

  const deleteGoogle = async () => {
    if (!session?.orgId) return;
    setBusy('google'); setError(null);
    try { await api.del(`/v1/organizations/${session.orgId}/settings/integrations/oauth/google`, session.accessToken); setNotice('تم حذف عميل Google المحفوظ'); await load(); }
    catch (e) { setError(arabicMessage(e as never)); }
    finally { setBusy(null); }
  };

  const copyRedirect = async () => {
    if (!data?.youtube.redirectUri) return;
    try { await navigator.clipboard.writeText(data.youtube.redirectUri); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };
  const copyTikTokRedirect = async () => {
    if (!data?.tiktok.redirectUri) return;
    try { await navigator.clipboard.writeText(data.tiktok.redirectUri); setCopiedTikTok(true); setTimeout(() => setCopiedTikTok(false), 1800); } catch {}
  };

  const saveTikTok = async () => {
    if (!session?.orgId || tiktokKey.trim().length < 4 || tiktokSecret.trim().length < 8) return setError('ألصق TikTok Client Key و Secret كاملين');
    setBusy('tiktok'); setError(null); setNotice(null);
    try {
      await api.put(`/v1/organizations/${session.orgId}/settings/integrations/oauth/tiktok`, { clientKey: tiktokKey.trim(), clientSecret: tiktokSecret.trim() }, session.accessToken);
      setNotice('تحققت TikTok من العميل وحُفظ مشفراً — أصبح الربط عبر TikTok جاهزاً.');
      setTiktokKey(''); setTiktokSecret(''); await load();
    } catch (e) { setError(arabicMessage(e as never)); } finally { setBusy(null); }
  };
  const deleteTikTok = async () => {
    if (!session?.orgId) return;
    setBusy('tiktok'); setError(null);
    try { await api.del(`/v1/organizations/${session.orgId}/settings/integrations/oauth/tiktok`, session.accessToken); setNotice('تم حذف عميل TikTok المحفوظ'); await load(); }
    catch (e) { setError(arabicMessage(e as never)); } finally { setBusy(null); }
  };

  if (!ready || !session) return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;

  return (
    <AppShell session={session} title="Settings" subtitle="A premium control room for AI providers, video engines and channel OAuth credentials.">
      {error && <div className="alert err">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div className="section-grid two">
        <Reveal>
          <GlassCard>
            <SectionHeader eyebrow="LLM Providers" title="Script generation keys." body="Attach the model provider that powers your creative writing stage. Prompts are versioned (script v1 / idea v1 / hook v1) — no hard-coded strings in UI." />
            {data?.ai.active && <div className="alert ok">Active provider: <strong>{data.ai.items.find((i) => i.id === data.ai.active?.provider)?.label}</strong></div>}
            <div className="field"><label>Provider</label><select value={provider} onChange={(e) => setProvider(e.target.value)}>{(data?.ai.items ?? []).map((i) => <option key={i.id} value={i.id}>{i.label} ({i.model})</option>)}</select></div>
            <div className="field"><label>API key</label><input dir="ltr" type="password" placeholder="Paste provider key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></div>
            <button className="btn btn-primary btn-block" onClick={() => void saveKey()} disabled={busy === `ai:${provider}`}><Cpu size={16} /> {busy === `ai:${provider}` ? 'Validating…' : 'Validate & Save'}</button>
            <p className="form-note">{PROVIDER_BLURB[provider]}</p>
          </GlassCard>
        </Reveal>

        <Reveal delay={0.06}>
          <GlassCard>
            <SectionHeader eyebrow="Video Engines" title="Moving-scene providers." body="Switch from still-image composition to animated scene generation with a verified provider key." />
            {data?.video.active && <div className="alert ok">Active engine: <strong>{data.video.items.find((i) => i.id === data.video.active?.provider)?.label}</strong></div>}
            <div className="field"><label>Video provider</label><select value={videoProvider} onChange={(e) => setVideoProvider(e.target.value)}>{(data?.video.items ?? []).map((i) => <option key={i.id} value={i.id}>{i.label} — {i.priceHint}</option>)}</select></div>
            <div className="field"><label>API key</label><input dir="ltr" type="password" placeholder="Paste video provider key" value={videoKey} onChange={(e) => setVideoKey(e.target.value)} /></div>
            <button className="btn btn-primary btn-block" onClick={() => void saveVideoKey()} disabled={busy === `video:${videoProvider}`}><Video size={16} /> {busy === `video:${videoProvider}` ? 'Validating…' : 'Validate & Save'}</button>
            <p className="form-note">{chosenVideo?.priceHint}</p>
          </GlassCard>
        </Reveal>
      </div>

      <div className="section-grid two" style={{ marginTop: 18 }}>
        <Reveal>
          <GlassCard>
            <SectionHeader eyebrow="Channel OAuth — YouTube" title="Google client pair." body="Store a verified Google OAuth client so YouTube linking becomes available for this workspace. 503 until configured — exact env keys named in the error." />
            {data?.youtube.configured ? (
              <div className="alert ok">Google OAuth configured {data.youtube.hint ? `(${data.youtube.hint})` : ''}. <button className="btn btn-ghost" style={{ marginInlineStart: 10 }} onClick={() => void deleteGoogle()} disabled={busy === 'google'}>Delete client</button></div>
            ) : (
              <>
                <div className="field"><label>Redirect URI (register exactly in Google Cloud Console)</label><div className="row"><input readOnly value={data?.youtube.redirectUri ?? `${API_BASE}/v1/channels/oauth/youtube/callback`} /><button className="btn btn-ghost" onClick={() => void copyRedirect()}>{copied ? 'Copied' : 'Copy'}</button></div></div>
                <div className="field"><label>Client ID</label><input dir="ltr" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="...apps.googleusercontent.com" /></div>
                <div className="field"><label>Client Secret</label><input dir="ltr" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="GOCSPX-..." /></div>
                <button className="btn btn-primary btn-block" onClick={() => void saveGoogle()} disabled={busy === 'google'}><ShieldEllipsis size={16} /> {busy === 'google' ? 'Validating…' : 'Validate & Save'}</button>
              </>
            )}
          </GlassCard>
        </Reveal>

        <Reveal delay={0.06}>
          <GlassCard>
            <SectionHeader eyebrow="Channel OAuth — TikTok" title="TikTok Client pair (PKCE)." body="Store a verified TikTok OAuth client (Login Kit + Video Upload API) so TikTok linking & publishing become available. Provider-isolated — uses TikTok Content Posting API v2." />
            {data?.tiktok.configured ? (
              <div className="alert ok">TikTok OAuth configured {data.tiktok.hint ? `(${data.tiktok.hint})` : ''}. <button className="btn btn-ghost" style={{ marginInlineStart: 10 }} onClick={() => void deleteTikTok()} disabled={busy === 'tiktok'}>Delete client</button></div>
            ) : (
              <>
                <div className="field"><label>Redirect URI (register exactly in TikTok Developers)</label><div className="row"><input readOnly value={data?.tiktok.redirectUri ?? `${API_BASE}/v1/channels/oauth/tiktok/callback`} /><button className="btn btn-ghost" onClick={() => void copyTikTokRedirect()}>{copiedTikTok ? 'Copied' : 'Copy'}</button></div></div>
                <div className="field"><label>Client Key</label><input dir="ltr" value={tiktokKey} onChange={(e) => setTiktokKey(e.target.value)} placeholder="TikTok Client Key" /></div>
                <div className="field"><label>Client Secret</label><input dir="ltr" type="password" value={tiktokSecret} onChange={(e) => setTiktokSecret(e.target.value)} placeholder="TikTok Client Secret" /></div>
                <button className="btn btn-primary btn-block" onClick={() => void saveTikTok()} disabled={busy === 'tiktok'}><ShieldEllipsis size={16} /> {busy === 'tiktok' ? 'Validating…' : 'Validate & Save'}</button>
                <p className="form-note">TikTok requires PKCE — handled automatically. Env: <code>TIKTOK_CLIENT_KEY</code> / <code>TIKTOK_CLIENT_SECRET</code></p>
              </>
            )}
          </GlassCard>
        </Reveal>
      </div>

      <Reveal>
        <GlassCard>
          <SectionHeader eyebrow="Saved Integrations" title="Credential inventory." body="A premium summary of active, fallback and environment-backed connections." />
          <div className="section-grid two">
            {(data?.ai.items ?? []).filter((item) => item.configured).map((item) => (
              <HoverLift key={item.id}><div className="glass-card"><p className="eyebrow subtle">AI</p><h3>{item.label}</h3><p>{item.hint ?? item.envKey}</p><div className="row" style={{ marginTop: 14 }}><span className={`stat-chip ${item.active ? 'stat-ready' : 'stat-plain'}`}>{item.active ? 'Active' : item.source === 'env' ? 'Environment' : 'Stored'}</span>{item.source === 'org' && <button className="btn btn-ghost" onClick={() => void deleteKey(item.id)} disabled={busy === `del:${item.id}`}><KeyRound size={14} /> Delete</button>}</div></div></HoverLift>
            ))}
            {(data?.video.items ?? []).filter((item) => item.configured).map((item) => (
              <HoverLift key={item.id}><div className="glass-card"><p className="eyebrow subtle">VIDEO</p><h3>{item.label}</h3><p>{item.hint ?? item.envKey}</p><div className="row" style={{ marginTop: 14 }}><span className={`stat-chip ${item.active ? 'stat-ready' : 'stat-plain'}`}>{item.active ? 'Active' : item.source === 'env' ? 'Environment' : 'Stored'}</span>{item.source === 'org' && <button className="btn btn-ghost" onClick={() => void deleteVideoKey(item.id)} disabled={busy === `vdel:${item.id}`}><KeyRound size={14} /> Delete</button>}</div></div></HoverLift>
            ))}
          </div>
        </GlassCard>
      </Reveal>
    </AppShell>
  );
}
