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
    return {
      ai: { active: active ? { provider: active.def.id, source: active.source } : null, items },
      youtube: {
        configured: Boolean(google),
        source: google?.source ?? null,
        hint: google ? (typeof googleStored?.['hint'] === 'string' ? (googleStored['hint'] as string) : 'env •••') : null,
        redirectUri: this.googleRedirectUri(),
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
        redirect_uri: this.googleRedirectUri() ?? 'https://localhost/',
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
}
