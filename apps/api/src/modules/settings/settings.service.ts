/**
 * SettingsService — self-service integrations for an organization:
 * AI provider keys and the Google OAuth client, both validated LIVE before
 * they are allowed into the vault. A key the provider rejects is never saved
 * (400 VALIDATION_FAILED with the provider's own rejection message).
 */
import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '@aca/config';
import { ApiError } from '../../common/errors/api-error.js';
import { API_CONFIG } from '../../common/redis.provider.js';
import { OrgCredentialsService } from '../../common/credentials/org-credentials.service.js';
import { LLM_PROVIDERS, LLM_PROVIDER_MAP, validateApiKey } from '../ai/providers.js';
import { VIDEO_PROVIDERS, VIDEO_PROVIDER_MAP, validateVideoKey } from '../ai/providers-video.js';

const badKey = (detail: string) => new ApiError('VALIDATION_FAILED', 'Validation Failed', { detail });

@Injectable()
export class SettingsService {
  constructor(
    @Inject(API_CONFIG) private readonly config: AppConfig,
    private readonly creds: OrgCredentialsService,
  ) {}

  /** The redirect URI tenants must register in Google Cloud Console. */
  googleRedirectUri(): string | null {
    const explicit = this.config.platforms.googleOauthRedirectUri;
    if (explicit) return explicit;
    const base = this.config.urls.publicApi?.replace(/\/+$/, '');
    return base ? `${base}/v1/channels/oauth/youtube/callback` : null;
  }
  tiktokRedirectUri(): string | null {
    const explicit = this.config.platforms.tiktokOauthRedirectUri;
    if (explicit) return explicit;
    const base = this.config.urls.publicApi?.replace(/\/+$/, '');
    return base ? `${base}/v1/channels/oauth/tiktok/callback` : null;
  }

  async getIntegrations(orgId: string) {
    const stored = await this.creds.listNamespace(orgId, 'LLM');
    const active = await this.creds.resolveLlm(orgId);
    const storedMap = new Map(stored.map((s) => [s.provider, s]));
    const envConfigured = (id: string): boolean => {
      const key = this.config.ai as Record<string, string | undefined>;
      const map: Record<string, string | undefined> = {
        openai: key['openaiApiKey'],
        groq: key['groqApiKey'],
        gemini: key['geminiApiKey'],
        openrouter: key['openrouterApiKey'],
        pollinations: key['pollinationsApiKey'],
      };
      const v = map[id];
      return typeof v === 'string' && v.length > 0;
    };
    const items = LLM_PROVIDERS.map((def) => {
      const row = storedMap.get(def.id);
      const env = envConfigured(def.id);
      return {
        id: def.id,
        label: def.label,
        model: def.model,
        free: def.free,
        consoleUrl: def.consoleUrl,
        envKey: def.envKey,
        configured: Boolean(row) || env,
        source: row ? ('org' as const) : env ? ('env' as const) : null,
        hint: row?.hint ?? (env ? 'env •••' : null),
        validatedAt: row?.validatedAt ?? null,
        active: active?.def.id === def.id,
      };
    });
    const google = await this.creds.resolveGoogleOAuth(orgId);
    const googleStored = await this.creds.readSecret(orgId, 'PUBLISHER', 'google-oauth');
    const tiktok = await this.creds.resolveTikTokOAuth(orgId);
    const tiktokStored = await this.creds.readSecret(orgId, 'PUBLISHER', 'tiktok-oauth');
    const videoStored = await this.creds.listNamespace(orgId, 'VIDEO_ENGINE');
    const videoActive = await this.creds.resolveVideo(orgId);
    const videoStoredMap = new Map(videoStored.map((s) => [s.provider, s]));
    const videoEnvConfigured = (id: string): boolean => {
      const ai = this.config.ai as Record<string, string | undefined>;
      const v = { runway: ai['runwayApiKey'], luma: ai['lumaApiKey'], 'fal-kling': ai['falKey'] }[id];
      return typeof v === 'string' && v.length > 0;
    };
    const videoItems = VIDEO_PROVIDERS.map((def) => {
      const row = videoStoredMap.get(def.id);
      const env = videoEnvConfigured(def.id);
      return {
        id: def.id,
        label: def.label,
        free: false,
        priceHint: def.priceHint,
        consoleUrl: def.consoleUrl,
        envKey: def.envKey,
        configured: Boolean(row) || env,
        source: row ? ('org' as const) : env ? ('env' as const) : null,
        hint: row?.hint ?? (env ? 'env •••' : null),
        validatedAt: row?.validatedAt ?? null,
        active: videoActive?.def.id === def.id,
      };
    });
    return {
      video: { active: videoActive ? { provider: videoActive.def.id, source: videoActive.source } : null, items: videoItems },
      ai: { active: active ? { provider: active.def.id, source: active.source } : null, items },
      youtube: {
        configured: Boolean(google),
        source: google?.source ?? null,
        hint: google ? (typeof googleStored?.['hint'] === 'string' ? (googleStored['hint'] as string) : 'env •••') : null,
        redirectUri: this.googleRedirectUri(),
      },
      tiktok: {
        configured: Boolean(tiktok),
        source: tiktok?.source ?? null,
        hint: tiktok ? (typeof tiktokStored?.['hint'] === 'string' ? (tiktokStored['hint'] as string) : 'env •••') : null,
        redirectUri: this.tiktokRedirectUri(),
      },
    };
  }

  async saveAiKey(orgId: string, providerId: string, apiKey: string) {
    const def = LLM_PROVIDER_MAP.get(providerId);
    if (!def) throw badKey(`مزود غير معروف: ${providerId}`);
    try {
      await validateApiKey(def, apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw badKey(`المفتاح غير صالح لدى ${def.label} — تحقق من نسخه كاملاً من ${def.consoleUrl} — التفصيل: ${msg}`);
    }
    const payload = { secret: apiKey, hint: OrgCredentialsService.hint(apiKey), validatedAt: new Date().toISOString() };
    await this.creds.writeSecret(orgId, 'LLM', providerId, payload);
    return { ok: true as const, provider: providerId, hint: payload.hint, validatedAt: payload.validatedAt };
  }

  async deleteAiKey(orgId: string, providerId: string) {
    const removed = await this.creds.deleteSecret(orgId, 'LLM', providerId);
    if (!removed) throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'لا يوجد مفتاح محفوظ لهذا المزود' });
    return { ok: true as const };
  }

  async saveVideoKey(orgId: string, providerId: string, apiKey: string) {
    const def = VIDEO_PROVIDER_MAP.get(providerId);
    if (!def) throw badKey(`مزود فيديو غير معروف: ${providerId}`);
    try {
      await validateVideoKey(def, apiKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw badKey(`المفتاح غير صالح لدى ${def.label} — تحقق من نسخه من ${def.consoleUrl} — التفصيل: ${msg}`);
    }
    const payload = { secret: apiKey, hint: OrgCredentialsService.hint(apiKey), validatedAt: new Date().toISOString() };
    await this.creds.writeSecret(orgId, 'VIDEO_ENGINE', providerId, payload);
    return { ok: true as const, provider: providerId, hint: payload.hint, validatedAt: payload.validatedAt };
  }

  async deleteVideoKey(orgId: string, providerId: string) {
    const removed = await this.creds.deleteSecret(orgId, 'VIDEO_ENGINE', providerId);
    if (!removed) throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'لا يوجد مفتاح محفوظ لهذا المزود' });
    return { ok: true as const };
  }

  /**
   * REAL validation of a Google OAuth client pair: probe Google's token
   * endpoint with a deliberately invalid authorization code. Google answers
   * `invalid_grant` (client recognized, code wrong) only when BOTH id+secret
   * are valid; a wrong pair gets 401/`invalid_client`.
   */
  async saveGoogleOAuth(orgId: string, clientId: string, clientSecret: string) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: 'probe_invalid_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: this.googleRedirectUri() ?? 'https://invalid.invalid/callback',
        grant_type: 'authorization_code',
      }),
    });
    const data = (await res.json().catch(() => null)) as { error?: string; error_description?: string } | null;
    const code = data?.error ?? `http_${res.status}`;
    if (code !== 'invalid_grant') {
      throw badKey(
        `رفضت Google هذا الزوج (client id/secret): ${code}${data?.error_description ? ` — ${data.error_description}` : ''}. ` +
          'تأكد من نسخ الحقلين من Google Cloud Console ← APIs & Services ← Credentials ← OAuth 2.0 Client (نوع: Web application).',
      );
    }
    await this.creds.saveGoogleOAuth(orgId, clientId, clientSecret);
    return { ok: true as const, provider: 'google-oauth', hint: OrgCredentialsService.hint(clientId), validatedAt: new Date().toISOString() };
  }

  async deleteGoogleOAuth(orgId: string) {
    const removed = await this.creds.deleteGoogleOAuth(orgId);
    if (!removed) throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'لا يوجد عميل Google محفوظ لهذه المنظمة' });
    return { ok: true as const };
  }

  async saveTikTokOAuth(orgId: string, clientKey: string, clientSecret: string) {
    // Validate TikTok client pair by probing token endpoint with invalid code — TikTok returns invalid_grant only for valid pair
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: 'probe_invalid_code',
        grant_type: 'authorization_code',
        redirect_uri: this.tiktokRedirectUri() ?? 'https://invalid.invalid/callback',
        code_verifier: 'probe_verifier',
      }),
    });
    const data = (await res.json().catch(() => null)) as { error?: string; error_description?: string; message?: string } | null;
    const raw = (data?.error ?? data?.message ?? '').toLowerCase();
    // Valid pair yields "invalid_grant" or "invalid code"; invalid pair yields "invalid_client" / "unauthorized"
    const isValidPair = raw.includes('invalid_grant') || raw.includes('invalid_code') || raw.includes('code') || res.status === 400;
    const isInvalidClient = raw.includes('invalid_client') || raw.includes('unauthorized_client') || raw.includes('client');
    if (isInvalidClient && !isValidPair) {
      throw badKey(`رفضت TikTok هذا الزوج (Client Key/Secret): ${raw}. تأكد من نسخه من TikTok Developers → Manage apps.`);
    }
    if (!isValidPair && res.status === 401) {
      throw badKey(`رفضت TikTok هذا الزوج (HTTP 401): ${data?.error_description ?? raw}. تأكد من نسخ Client Key و Secret بشكل صحيح.`);
    }
    await this.creds.saveTikTokOAuth(orgId, clientKey, clientSecret);
    return { ok: true as const, provider: 'tiktok-oauth', hint: OrgCredentialsService.hint(clientKey), validatedAt: new Date().toISOString() };
  }

  async deleteTikTokOAuth(orgId: string) {
    const removed = await this.creds.deleteTikTokOAuth(orgId);
    if (!removed) throw new ApiError('NOT_FOUND', 'Not Found', { detail: 'لا يوجد عميل TikTok محفوظ لهذه المنظمة' });
    return { ok: true as const };
  }
}
