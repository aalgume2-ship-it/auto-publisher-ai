/**
 * ChannelsService — Multi-platform channel linking (real OAuth),
 * encrypted credential vault, refresh, disconnect. THIN-controller rule:
 * all logic lives here. Fail-closed: missing client config or vault
 * master key → 503 PLATFORM_ERROR naming the exact env keys to provision.
 *
 * Providers are isolated (publishers/): adding Instagram/Facebook/etc.
 * is a new publisher file + OAuth file — no core rebuild.
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
import {
  buildTikTokAuthorizeUrl,
  exchangeTikTokCode,
  fetchTikTokUser,
  newTikTokState,
  pkcePair,
  refreshTikTokToken,
  revokeTikTokToken,
  signTikTokState,
  verifyTikTokState,
} from './tiktok-oauth.js';
import {
  buildMetaAuthorizeUrl,
  exchangeMetaCode,
  exchangeLongLivedToken,
  fetchInstagramAccount,
  newMetaState,
  revokeMetaToken,
  signMetaState,
  verifyMetaState,
} from './meta-oauth.js';

const notFound = (what: string) => new ApiError('NOT_FOUND', 'Not Found', { detail: what });
const IG_SCOPES_ARR = ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_comments'];

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

  private async metaConfig(orgId: string): Promise<{ appId: string; appSecret: string; redirectUri: string }> {
    const base = this.config.urls.publicApi;
    const redirectUri = base ? `${base.replace(/\/+$/, '')}/v1/channels/oauth/instagram/callback` : undefined;
    const resolved = await this.creds.resolveMetaOAuth(orgId);
    if (!resolved || !redirectUri) {
      throw new ApiError('PLATFORM_ERROR', 'Service Unavailable', {
        status: 503,
        detail:
          'ربط إنستغرام يحتاج تطبيق Meta for Developers (~5 دقائق): أنشئ تطبيقاً على developers.facebook.com مع منتج Instagram API، ثم ألصق App ID و App Secret من لوحة التحكم ← الإعدادات ← «عميل Meta». سجّل Redirect URI التالي: ' +
          (redirectUri ?? 'https://<api-host>/v1/channels/oauth/instagram/callback') +
          ' — أو اضبط META_APP_ID و META_APP_SECRET في بيئة الـ API.',
      });
    }
    return { appId: resolved.appId, appSecret: resolved.appSecret, redirectUri };
  }

  private async tiktokConfig(orgId: string): Promise<{ clientKey: string; clientSecret: string; redirectUri: string }> {
    const base = this.config.urls.publicApi;
    const redirectUri = this.config.platforms.tiktokOauthRedirectUri ?? (base ? `${base.replace(/\/+$/, '')}/v1/channels/oauth/tiktok/callback` : undefined);
    const resolved = await this.creds.resolveTikTokOAuth(orgId);
    if (!resolved || !redirectUri) {
      throw new ApiError('PLATFORM_ERROR', 'Service Unavailable', {
        status: 503,
        detail:
          'ربط TikTok يحتاج تطبيق TikTok for Developers (~3 دقائق): من https://developers.tiktok.com → Manage apps → Create app → أضف Login Kit و Video Upload API، وسجّل Redirect URI التالي: ' +
          (redirectUri ?? 'https://<api-host>/v1/channels/oauth/tiktok/callback') +
          ' ثم ألصق Client Key و Client Secret في لوحة التحكم ← الإعدادات ← TikTok OAuth. أو اضبط TIKTOK_CLIENT_KEY و TIKTOK_CLIENT_SECRET في بيئة الـ API.',
      });
    }
    return { clientKey: resolved.clientKey, clientSecret: resolved.clientSecret, redirectUri };
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
      items: rows.map((c: any) => ({
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

  /* ------------------------------------------------------ YouTube OAuth: start */

  async startYoutubeLink(orgId: string, userId: string) {
    const { clientId, redirectUri } = await this.googleConfig(orgId);
    this.vault();
    const state = signState(newState(orgId, userId), this.stateSecret());
    return { authorizeUrl: buildAuthorizeUrl(clientId, redirectUri, state), expiresInSec: 600 };
  }

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

    await this.prisma.$transaction(async (tx: any) => {
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

  /* ------------------------------------------------------- TikTok OAuth: start */

  async startTikTokLink(orgId: string, userId: string) {
    const { clientKey, redirectUri } = await this.tiktokConfig(orgId);
    this.vault();
    const { verifier, challenge } = pkcePair();
    const state = signTikTokState(newTikTokState(orgId, userId, verifier), this.stateSecret());
    const authorizeUrl = buildTikTokAuthorizeUrl(clientKey, redirectUri, state, challenge);
    return { authorizeUrl, expiresInSec: 600 };
  }

  async completeTikTokCallback(code: string | undefined, state: string | undefined): Promise<{ redirectTo: string }> {
    const webBase = this.config.urls.publicWeb?.replace(/\/+$/, '') ?? '';
    if (!code || !state) throw new ApiError('VALIDATION_FAILED', 'Missing code/state', { detail: 'oauth callback requires code and state query params' });
    const parsed = verifyTikTokState(state, this.stateSecret());
    if (!parsed) throw new ApiError('UNAUTHENTICATED', 'Invalid OAuth state', { detail: 'state signature invalid or expired (10 min window) — restart the link flow' });

    const { clientKey, clientSecret, redirectUri } = await this.tiktokConfig(parsed.orgId);
    const tokens = await exchangeTikTokCode(code, clientKey, clientSecret, redirectUri, parsed.verifier);
    const info = await fetchTikTokUser(tokens.access_token);

    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
    const refreshExpiresAt = tokens.refresh_expires_in ? new Date(Date.now() + tokens.refresh_expires_in * 1000) : null;
    const vault = this.vault();
    // Store both access and refresh + open_id for traceability
    const packed = vault.encrypt(JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? null, open_id: tokens.open_id ?? info.openId }));

    await this.prisma.$transaction(async (tx: any) => {
      const channel = await tx.channel.upsert({
        where: { orgId_platform_platformChannelId: { orgId: parsed.orgId, platform: 'tiktok', platformChannelId: info.openId } },
        create: {
          id: generateId(),
          orgId: parsed.orgId,
          platform: 'tiktok',
          platformChannelId: info.openId,
          displayName: info.displayName,
          handle: null,
          avatarUrl: info.avatarUrl,
          status: 'CONNECTED',
          scopes: (tokens.scope ?? '').split(',').map(s => s.trim()).filter(Boolean),
          followers: info.followers ? BigInt(info.followers) : null,
          lastSyncAt: new Date(),
        },
        update: {
          displayName: info.displayName,
          avatarUrl: info.avatarUrl,
          status: 'CONNECTED',
          scopes: (tokens.scope ?? '').split(',').map(s => s.trim()).filter(Boolean),
          followers: info.followers ? BigInt(info.followers) : null,
          lastSyncAt: new Date(),
          lastError: null,
          disconnectedAt: null,
        },
      });
      await tx.channelCredential.upsert({
        where: { channelId: channel.id },
        create: { id: generateId(), channelId: channel.id, ciphertext: packed.ciphertext, keyId: packed.keyId, accessTokenExpiresAt: expiresAt, refreshTokenExpiresAt: refreshExpiresAt },
        update: { ciphertext: packed.ciphertext, keyId: packed.keyId, accessTokenExpiresAt: expiresAt, refreshTokenExpiresAt: refreshExpiresAt, rotatedAt: new Date() },
      });
    });

    return { redirectTo: `${webBase}/dashboard/channels/?linked=tiktok&name=${encodeURIComponent(info.displayName)}` };
  }

  /* ------------------------------------------------------------ disconnect */

  async disconnect(orgId: string, channelId: string): Promise<{ ok: true }> {
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, orgId } });
    if (!channel) throw notFound('channel not found');
    const cred = await this.prisma.channelCredential.findUnique({ where: { channelId } });
    if (cred) {
      try {
        const data = JSON.parse(this.vault().decrypt(cred.ciphertext)) as { access_token?: string };
        if (data.access_token) {
          if (channel.platform === 'tiktok') await revokeTikTokToken(data.access_token);
          else if (channel.platform === 'instagram') await revokeMetaToken(data.access_token);
          else await revokeToken(data.access_token);
        }
      } catch {
        /* revoke is best-effort */
      }
    }
    await this.prisma.channel.delete({ where: { id: channel.id } });
    return { ok: true };
  }

  /* ------------------------------------------- publisher support (internal) */

  /** Fresh access token for YouTube publisher worker */
  async freshAccessToken(channelId: string): Promise<string> {
    const cred = await this.prisma.channelCredential.findUnique({ where: { channelId } });
    if (!cred) throw new Error('channel credential missing (was the link revoked?)');
    const channel = await this.prisma.channel.findUnique({ where: { id: cred.channelId } });
    if (!channel) throw new Error('channel row missing for credential');
    if (channel.platform !== 'youtube') throw new Error('freshAccessToken called for non-youtube channel — use freshTikTokAccessToken');
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

  /** Fresh access token for TikTok publisher worker */
  async freshTikTokAccessToken(channelId: string): Promise<string> {
    const cred = await this.prisma.channelCredential.findUnique({ where: { channelId } });
    if (!cred) throw new Error('channel credential missing (was the link revoked?)');
    const channel = await this.prisma.channel.findUnique({ where: { id: cred.channelId } });
    if (!channel) throw new Error('channel row missing for credential');
    if (channel.platform !== 'tiktok') throw new Error('freshTikTokAccessToken called for non-tiktok channel');
    const secret = JSON.parse(this.vault().decrypt(cred.ciphertext)) as { access_token: string; refresh_token?: string | null; open_id?: string };
    const stillValid = cred.accessTokenExpiresAt === null || cred.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
    if (stillValid) return secret.access_token;
    if (!secret.refresh_token) throw new Error('tiktok token expired and no refresh_token stored — re-link the channel');
    const { clientKey, clientSecret } = await this.tiktokConfig(channel.orgId);
    const bundle = await refreshTikTokToken(secret.refresh_token, clientKey, clientSecret);
    const packed = this.vault().encrypt(JSON.stringify({ access_token: bundle.access_token, refresh_token: bundle.refresh_token ?? secret.refresh_token, open_id: bundle.open_id ?? secret.open_id }));
    await this.prisma.channelCredential.update({
      where: { channelId },
      data: {
        ciphertext: packed.ciphertext,
        keyId: packed.keyId,
        accessTokenExpiresAt: bundle.expires_in ? new Date(Date.now() + bundle.expires_in * 1000) : null,
        refreshTokenExpiresAt: bundle.refresh_expires_in ? new Date(Date.now() + bundle.refresh_expires_in * 1000) : null,
        rotatedAt: new Date(),
      },
    });
    return bundle.access_token;
  }

  async startInstagramLink(orgId: string, userId: string) {
    const { appId, redirectUri } = await this.metaConfig(orgId);
    this.vault();
    const state = signMetaState(newMetaState(orgId, userId), this.stateSecret());
    const authorizeUrl = buildMetaAuthorizeUrl(appId, redirectUri, state);
    return { authorizeUrl, expiresInSec: 600 };
  }

  async completeInstagramCallback(code: string | undefined, state: string | undefined): Promise<{ redirectTo: string }> {
    const webBase = this.config.urls.publicWeb?.replace(/\/+$/, '') ?? '';
    if (!code || !state) throw new ApiError('VALIDATION_FAILED', 'Missing code/state', { detail: 'oauth callback requires code and state query params' });
    const parsed = verifyMetaState(state, this.stateSecret());
    if (!parsed) throw new ApiError('UNAUTHENTICATED', 'Invalid OAuth state', { detail: 'state signature invalid or expired (10 min window) — restart the link flow' });

    const { appId, appSecret, redirectUri } = await this.metaConfig(parsed.orgId);
    const short = await exchangeMetaCode(appId, appSecret, redirectUri, code);
    const long = await exchangeLongLivedToken(appId, appSecret, short.access_token);
    const info = await fetchInstagramAccount(long.access_token);

    const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null;
    const vault = this.vault();
    const packed = vault.encrypt(JSON.stringify({ access_token: long.access_token, refresh_token: null, ig_account_id: info.instagramBusinessAccountId }));

    await this.prisma.$transaction(async (tx: any) => {
      const channel = await tx.channel.upsert({
        where: { orgId_platform_platformChannelId: { orgId: parsed.orgId, platform: 'instagram', platformChannelId: info.instagramBusinessAccountId } },
        create: {
          id: generateId(),
          orgId: parsed.orgId,
          platform: 'instagram',
          platformChannelId: info.instagramBusinessAccountId,
          displayName: info.name ?? info.username ?? 'Instagram account',
          handle: info.username,
          avatarUrl: info.profilePictureUrl,
          status: 'CONNECTED',
          scopes: IG_SCOPES_ARR,
          followers: info.followers ? BigInt(info.followers) : null,
          lastSyncAt: new Date(),
        },
        update: {
          displayName: info.name ?? info.username ?? 'Instagram account',
          handle: info.username,
          avatarUrl: info.profilePictureUrl,
          status: 'CONNECTED',
          scopes: IG_SCOPES_ARR,
          followers: info.followers ? BigInt(info.followers) : null,
          lastSyncAt: new Date(),
          lastError: null,
          disconnectedAt: null,
        },
      });
      await tx.channelCredential.upsert({
        where: { channelId: channel.id },
        create: { id: generateId(), channelId: channel.id, ciphertext: packed.ciphertext, keyId: packed.keyId, accessTokenExpiresAt: expiresAt, refreshTokenExpiresAt: null },
        update: { ciphertext: packed.ciphertext, keyId: packed.keyId, accessTokenExpiresAt: expiresAt, rotatedAt: new Date() },
      });
    });

    return { redirectTo: `${webBase}/dashboard/channels/?linked=instagram&name=${encodeURIComponent(info.name ?? info.username ?? 'Instagram')}` };
  }

  /** Fresh access token for the Instagram publisher worker. */
  async freshInstagramAccessToken(channelId: string): Promise<string> {
    const cred = await this.prisma.channelCredential.findUnique({ where: { channelId } });
    if (!cred) throw new Error('channel credential missing (was the link revoked?)');
    const channel = await this.prisma.channel.findUnique({ where: { id: cred.channelId } });
    if (!channel || channel.platform !== 'instagram') throw new Error('freshInstagramAccessToken called for non-instagram channel');
    const secret = JSON.parse(this.vault().decrypt(cred.ciphertext)) as { access_token: string; ig_account_id?: string };
    const stillValid = cred.accessTokenExpiresAt === null || cred.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
    if (stillValid) return secret.access_token;
    // Long-lived tokens can be refreshed via the same exchange endpoint when expired.
    const { appId, appSecret } = await this.metaConfig(channel.orgId);
    const bundle = await exchangeLongLivedToken(appId, appSecret, secret.access_token);
    const packed = this.vault().encrypt(JSON.stringify({ access_token: bundle.access_token, refresh_token: null, ig_account_id: secret.ig_account_id }));
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
