/**
 * ChannelsService — Module-2 core: YouTube channel linking (real OAuth),
 * encrypted credential vault, refresh, disconnect. THIN-controller rule:
 * all logic lives here. Fail-closed: missing Google client config or vault
 * master key → 503 PLATFORM_ERROR naming the exact env keys to provision.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '@aca/config';
import { ApiError } from '../../common/errors/api-error.js';
import { SecretEnvelope, keyringFromHex } from '@aca/auth';
import { generateId, type DbClient } from '@aca/database';
import { PRISMA } from '../../common/prisma.provider.js';
import { API_CONFIG } from '../../common/redis.provider.js';
import { OrgCredentialsService } from '../../common/credentials/org-credentials.service.js';
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchMyChannel,
  newState,
  refreshAccessToken,
  revokeToken,
  signState,
  verifyState,
} from './google-oauth.js';

const notFound = (what: string) => new ApiError('NOT_FOUND', 'Not Found', { detail: what });

@Injectable()
export class ChannelsService {
  constructor(
    @Inject(API_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: DbClient,
    private readonly creds: OrgCredentialsService,
  ) {}

  /** Envelope vault for channel tokens (fail-closed without SECRETS_MASTER_KEY). */
  private vault(): SecretEnvelope {
    const key = this.config.secrets.masterKey;
    if (!key) {
      throw new ApiError('PLATFORM_ERROR', 'Service Unavailable', {
        status: 503,
        detail: 'Token vault key not configured: set SECRETS_MASTER_KEY (64-hex) on the API service — required to store channel credentials encrypted at rest.',
      });
    }
    return new SecretEnvelope(keyringFromHex(key, this.config.secrets.masterKeyId));
  }

  /**
   * Google OAuth client resolution — the org's own client saved via
   * /dashboard/settings (vault) wins; process env is the fallback. Without
   * either we fail closed (503) with the exact self-service steps.
   */
  private async googleConfig(orgId: string): Promise<{ clientId: string; clientSecret: string; redirectUri: string }> {
    const base = this.config.urls.publicApi;
    const redirectUri = this.config.platforms.googleOauthRedirectUri ?? (base ? `${base.replace(/\/+$/, '')}/v1/channels/oauth/youtube/callback` : undefined);
    const resolved = await this.creds.resolveGoogleOAuth(orgId);
    if (!resolved || !redirectUri) {
      throw new ApiError('PLATFORM_ERROR', 'Service Unavailable', {
        status: 503,
        detail:
          'ربط يوتيوب يحتاج عميل Google OAuth خاصاً بك (مجاني، ~4 دقائق): من لوحة التحكم ← الإعدادات ← «عميل Google OAuth» ألصق Client ID و Secret بعد إنشائهما في Google Cloud Console وتسجيل الـ Redirect URI التالي: ' +
          (redirectUri ?? 'https://<api-host>/v1/channels/oauth/youtube/callback') +
          ' — يتم التحقق منهما لدى Google قبل الحفظ. أو اضبط GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET في بيئة الـ API.',
      });
    }
    return { clientId: resolved.clientId, clientSecret: resolved.clientSecret, redirectUri };
  }

  private stateSecret(): string {
    const s = this.config.auth.jwtSecret;
    if (!s) throw new ApiError('PLATFORM_ERROR', 'Service Unavailable', { status: 503, detail: 'AUTH_JWT_SECRET missing' });
    return s;
  }

  /* -------------------------------------------------------------- list/view */

  async list(orgId: string) {
    const rows = await this.prisma.channel.findMany({
      where: { orgId, status: { not: 'DISCONNECTED' } },
      orderBy: { connectedAt: 'desc' },
    });
    return {
      items: rows.map((c) => ({
        id: c.id,
        platform: c.platform,
        platformChannelId: c.platformChannelId,
        displayName: c.displayName,
        handle: c.handle,
        avatarUrl: c.avatarUrl,
        status: c.status,
        scopes: c.scopes,
        followers: c.followers === null ? null : c.followers.toString(),
        lastSyncAt: c.lastSyncAt,
        connectedAt: c.connectedAt,
      })),
    };
  }

  /* --------------------------------------------------------- OAuth: start */

  async startYoutubeLink(orgId: string, userId: string) {
    const { clientId, redirectUri } = await this.googleConfig(orgId);
    this.vault(); // fail closed BEFORE the user walks to Google
    const state = signState(newState(orgId, userId), this.stateSecret());
    return { authorizeUrl: buildAuthorizeUrl(clientId, redirectUri, state), expiresInSec: 600 };
  }

  /* ------------------------------------------------------ OAuth: callback */

  async completeYoutubeCallback(code: string | undefined, state: string | undefined): Promise<{ redirectTo: string }> {
    const webBase = this.config.urls.publicWeb?.replace(/\/+$/, '') ?? '';
    if (!code || !state) throw new ApiError('VALIDATION_FAILED', 'Missing code/state', { detail: 'oauth callback requires code and state query params' });
    const parsed = verifyState(state, this.stateSecret());
    if (!parsed) throw new ApiError('UNAUTHENTICATED', 'Invalid OAuth state', { detail: 'state signature invalid or expired (10 min window) — restart the link flow' });

    const { clientId, clientSecret, redirectUri } = await this.googleConfig(parsed.orgId);
    const tokens = await exchangeCode(code, clientId, clientSecret, redirectUri);
    const info = await fetchMyChannel(tokens.access_token);

    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
    const vault = this.vault();
    const packed = vault.encrypt(JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? null }));

    await this.prisma.$transaction(async (tx) => {
      const channel = await tx.channel.upsert({
        where: { orgId_platform_platformChannelId: { orgId: parsed.orgId, platform: 'youtube', platformChannelId: info.platformChannelId } },
        create: {
          id: generateId(),
          orgId: parsed.orgId,
          platform: 'youtube',
          platformChannelId: info.platformChannelId,
          displayName: info.title,
          handle: info.handle,
          avatarUrl: info.avatarUrl,
          status: 'CONNECTED',
          scopes: (tokens.scope ?? '').split(' ').filter(Boolean),
          followers: info.followers ? BigInt(info.followers) : null,
          lastSyncAt: new Date(),
        },
        update: {
          displayName: info.title,
          handle: info.handle,
          avatarUrl: info.avatarUrl,
          status: 'CONNECTED',
          scopes: (tokens.scope ?? '').split(' ').filter(Boolean),
          followers: info.followers ? BigInt(info.followers) : null,
          lastSyncAt: new Date(),
          lastError: null,
          disconnectedAt: null,
        },
      });
      await tx.channelCredential.upsert({
        where: { channelId: channel.id },
        create: { id: generateId(), channelId: channel.id, ciphertext: packed.ciphertext, keyId: packed.keyId, accessTokenExpiresAt: expiresAt },
        update: { ciphertext: packed.ciphertext, keyId: packed.keyId, accessTokenExpiresAt: expiresAt, rotatedAt: new Date() },
      });
    });

    return { redirectTo: `${webBase}/dashboard/channels/?linked=youtube&name=${encodeURIComponent(info.title)}` };
  }

  /* ------------------------------------------------------------ disconnect */

  async disconnect(orgId: string, channelId: string): Promise<{ ok: true }> {
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, orgId } });
    if (!channel) throw notFound('channel not found');
    const cred = await this.prisma.channelCredential.findUnique({ where: { channelId } });
    if (cred) {
      try {
        const { access_token } = JSON.parse(this.vault().decrypt(cred.ciphertext)) as { access_token?: string };
        if (access_token) await revokeToken(access_token); // best effort
      } catch {
        /* revoke is best-effort; local deletion is authoritative */
      }
    }
    // Hard delete (credential cascades) — no credential may outlive disconnect.
    await this.prisma.channel.delete({ where: { id: channel.id } });
    return { ok: true };
  }

  /* ------------------------------------------- publisher support (internal) */

  /** Fresh access token for the publisher worker — refreshes + re-encrypts when needed. */
  async freshAccessToken(channelId: string): Promise<string> {
    const cred = await this.prisma.channelCredential.findUnique({ where: { channelId } });
    if (!cred) throw new Error('channel credential missing (was the link revoked?)');
    const channel = await this.prisma.channel.findUnique({ where: { id: cred.channelId } });
    if (!channel) throw new Error('channel row missing for credential');
    const secret = JSON.parse(this.vault().decrypt(cred.ciphertext)) as { access_token: string; refresh_token?: string | null };
    const stillValid = cred.accessTokenExpiresAt === null || cred.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
    if (stillValid) return secret.access_token;
    if (!secret.refresh_token) throw new Error('token expired and no refresh_token stored — re-link the channel');
    const { clientId, clientSecret } = await this.googleConfig(channel.orgId);
    const bundle = await refreshAccessToken(secret.refresh_token, clientId, clientSecret);
    const packed = this.vault().encrypt(JSON.stringify({ access_token: bundle.access_token, refresh_token: secret.refresh_token }));
    await this.prisma.channelCredential.update({
      where: { channelId },
      data: {
        ciphertext: packed.ciphertext,
        keyId: packed.keyId,
        accessTokenExpiresAt: bundle.expires_in ? new Date(Date.now() + bundle.expires_in * 1000) : null,
        rotatedAt: new Date(),
      },
    });
    return bundle.access_token;
  }
}
