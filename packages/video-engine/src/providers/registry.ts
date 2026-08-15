/**
 * Provider registry — centralized status of every AI/social provider.
 * The API exposes this (masked — hints only, never keys) via
 * GET /v1/organizations/:orgId/providers/status; the UI renders the exact
 * state: configured / not_configured / error.
 */
import type { AppConfig } from '@aca/config';
import { type OrgCredentialsService } from '../vault/org-credentials.js';
import { LLM_PROVIDERS } from '../ai/providers.js';
import { VIDEO_PROVIDERS } from '../ai/providers-video.js';

export type ProviderCategory = 'VIDEO' | 'IMAGE' | 'LLM' | 'VOICE' | 'SOCIAL';
export type ProviderState = 'configured' | 'not_configured' | 'error';

export interface ProviderStatusEntry {
  id: string;
  category: ProviderCategory;
  label: string;
  model: string;
  envKey: string;
  state: ProviderState;
  source: 'env' | 'org' | 'keyless' | null;
  /** Masked hint (first3…last4). NEVER the raw secret. */
  hint?: string;
  error?: string;
}

const mask = (s: string): string => (s.length <= 8 ? `…${s.slice(-4)}` : `${s.slice(0, 3)}…${s.slice(-4)}`);

export class ProviderRegistry {
  constructor(
    private readonly config: AppConfig,
    private readonly creds: OrgCredentialsService,
  ) {}

  async status(orgId: string): Promise<{ items: ProviderStatusEntry[]; generatedAt: string }> {
    const ai = this.config.ai;
    const vault = await this.creds.listNamespace(orgId, 'LLM');
    const videoVault = await this.creds.listNamespace(orgId, 'VIDEO_ENGINE');
    const imageVault = await this.creds.listNamespace(orgId, 'IMAGE');
    const publisherVault = await this.creds.listNamespace(orgId, 'PUBLISHER');
    const vaultMap = new Map<string, string>();
    for (const v of [...vault, ...videoVault, ...imageVault, ...publisherVault]) {
      if (v.hint) vaultMap.set(v.provider, v.hint);
    }

    const items: ProviderStatusEntry[] = [];
    const push = (e: ProviderStatusEntry) => items.push(e);

    // ── VIDEO ──────────────────────────────────────────────────────────────
    for (const def of VIDEO_PROVIDERS) {
      const cfgKey = (ai as unknown as Record<string, string | undefined>)[envKeyToConfig(def.envKey)];
      const envKeyValue = cfgKey && cfgKey.length > 0 ? cfgKey : undefined;
      const orgHint = videoVault.find((v) => v.provider === def.id)?.hint;
      const state: ProviderState = envKeyValue || orgHint ? 'configured' : 'not_configured';
      const e: ProviderStatusEntry = {
        id: def.id, category: 'VIDEO', label: def.label, model: def.model, envKey: def.envKey,
        state, source: orgHint ? 'org' : envKeyValue ? 'env' : null,
      };
      if (orgHint) e.hint = orgHint;
      else if (envKeyValue) e.hint = mask(envKeyValue);
      push(e);
    }

    // ── IMAGE ──────────────────────────────────────────────────────────────
    const imageProviders: Array<{ id: string; label: string; model: string; envKey: string; key?: string | undefined; org?: string | undefined; state?: ProviderState; source?: ProviderStatusEntry['source'] | undefined }> = [
      { id: 'stability', label: 'Stability', model: 'sd3.5', envKey: 'STABILITY_API_KEY', key: ai.stabilityApiKey, org: imageVault.find((v) => v.provider === 'stability')?.hint },
      { id: 'openai-image', label: 'OpenAI (gpt-image)', model: 'gpt-image-1', envKey: 'OPENAI_API_KEY', key: ai.openaiApiKey, org: imageVault.find((v) => v.provider === 'openai')?.hint },
      { id: 'replicate', label: 'Replicate', model: 'sdxl', envKey: 'REPLICATE_API_TOKEN', key: ai.replicateApiToken, org: imageVault.find((v) => v.provider === 'replicate')?.hint },
      { id: 'pollinations-image', label: 'Pollinations (keyless)', model: 'flux', envKey: '', state: 'configured', source: 'keyless' },
    ];
    for (const p of imageProviders) {
      if (p.state === 'configured') {
        push({ id: p.id, category: 'IMAGE', label: p.label, model: p.model, envKey: p.envKey, state: 'configured', source: 'keyless' });
        continue;
      }
      const key = p.key && p.key.length > 0 ? p.key : undefined;
      const state: ProviderState = key || p.org ? 'configured' : 'not_configured';
      const e: ProviderStatusEntry = {
        id: p.id, category: 'IMAGE', label: p.label, model: p.model, envKey: p.envKey,
        state, source: p.org ? 'org' : key ? 'env' : null,
      };
      if (p.org) e.hint = p.org;
      else if (key) e.hint = mask(key);
      push(e);
    }

    // ── LLM ────────────────────────────────────────────────────────────────
    for (const def of LLM_PROVIDERS) {
      const cfgKey = (ai as unknown as Record<string, string | undefined>)[envKeyToConfig(def.envKey)];
      const envKeyValue = cfgKey && cfgKey.length > 0 ? cfgKey : undefined;
      const orgHint = vault.find((v) => v.provider === def.id)?.hint;
      const state: ProviderState = envKeyValue || orgHint ? 'configured' : 'not_configured';
      const e: ProviderStatusEntry = {
        id: def.id, category: 'LLM', label: def.label, model: def.model, envKey: def.envKey,
        state, source: orgHint ? 'org' : envKeyValue ? 'env' : null,
      };
      if (orgHint) e.hint = orgHint;
      else if (envKeyValue) e.hint = mask(envKeyValue);
      push(e);
    }

    // ── VOICE ──────────────────────────────────────────────────────────────
    push({ id: 'gtts', category: 'VOICE', label: 'gTTS (keyless)', model: 'translate_tts', envKey: '', state: 'configured', source: 'keyless' });
    {
      const state: ProviderState = ai.openaiApiKey ? 'configured' : 'not_configured';
      const e: ProviderStatusEntry = { id: 'openai-tts', category: 'VOICE', label: 'OpenAI TTS', model: 'tts-1', envKey: 'OPENAI_API_KEY', state, source: ai.openaiApiKey ? 'env' : null };
      if (ai.openaiApiKey) e.hint = mask(ai.openaiApiKey);
      push(e);
    }
    {
      const state: ProviderState = ai.elevenlabsApiKey ? 'configured' : 'not_configured';
      const e: ProviderStatusEntry = { id: 'elevenlabs', category: 'VOICE', label: 'ElevenLabs', model: 'eleven_multilingual_v2', envKey: 'ELEVENLABS_API_KEY', state, source: ai.elevenlabsApiKey ? 'env' : null };
      if (ai.elevenlabsApiKey) e.hint = mask(ai.elevenlabsApiKey);
      push(e);
    }

    // ── SOCIAL (OAuth clients) ─────────────────────────────────────────────
    const google = await this.creds.resolveGoogleOAuth(orgId);
    const tiktok = await this.creds.resolveTikTokOAuth(orgId);
    const meta = await this.creds.resolveMetaOAuth(orgId);
    {
      const state: ProviderState = google ? 'configured' : 'not_configured';
      const e: ProviderStatusEntry = { id: 'youtube', category: 'SOCIAL', label: 'YouTube', model: 'OAuth 2.0', envKey: 'GOOGLE_CLIENT_ID', state, source: google?.source ?? null };
      if (google) e.hint = mask(google.clientId);
      push(e);
    }
    {
      const state: ProviderState = tiktok ? 'configured' : 'not_configured';
      const e: ProviderStatusEntry = { id: 'tiktok', category: 'SOCIAL', label: 'TikTok', model: 'OAuth 2.0 + PKCE', envKey: 'TIKTOK_CLIENT_KEY', state, source: tiktok?.source ?? null };
      if (tiktok) e.hint = mask(tiktok.clientKey);
      push(e);
    }
    {
      const state: ProviderState = meta ? 'configured' : 'not_configured';
      const e: ProviderStatusEntry = { id: 'instagram', category: 'SOCIAL', label: 'Instagram', model: 'Meta Graph API', envKey: 'META_APP_ID', state, source: meta?.source ?? null };
      if (meta) e.hint = mask(meta.appId);
      push(e);
    }

    return { items, generatedAt: new Date().toISOString() };
  }
}

/** env var name → AppConfig.ai field name (for the env-side status check). */
function envKeyToConfig(envKey: string): string {
  const map: Record<string, string> = {
    RUNWAY_API_KEY: 'runwayApiKey',
    LUMA_API_KEY: 'lumaApiKey',
    FAL_KEY: 'falKey',
    OPENAI_API_KEY: 'openaiApiKey',
    GROQ_API_KEY: 'groqApiKey',
    GEMINI_API_KEY: 'geminiApiKey',
    OPENROUTER_API_KEY: 'openrouterApiKey',
    POLLINATIONS_API_KEY: 'pollinationsApiKey',
    STABILITY_API_KEY: 'stabilityApiKey',
    REPLICATE_API_TOKEN: 'replicateApiToken',
    ELEVENLABS_API_KEY: 'elevenlabsApiKey',
  };
  return map[envKey] ?? envKey;
}
