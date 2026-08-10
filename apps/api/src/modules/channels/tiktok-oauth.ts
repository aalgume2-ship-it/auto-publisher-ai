/**
 * TikTok OAuth 2.0 + Video Upload API — REAL client (plain fetch, no SDK).
 * Flow: /link → consent URL (PKCE + HMAC state) → TikTok redirects to our
 * callback → code exchange at open.tiktokapis.com/v2/oauth/token → user info
 * → encrypted credential at rest (same vault as YouTube).
 *
 * TikTok requires PKCE (code_challenge S256). We generate verifier + challenge
 * per OAuth attempt and bind it to the state envelope so the callback can
 * complete without server-side session.
 */
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

export const TK_SCOPES = ['user.info.basic', 'video.upload', 'video.publish'] as const;

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const USERINFO_URL = 'https://open.tiktokapis.com/v2/user/info/';
const REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';

export interface TikTokOAuthState {
  orgId: string;
  userId: string;
  nonce: string;
  verifier: string; // PKCE verifier — returned via state so callback is stateless
  exp: number;
}

export interface TikTokTokenBundle {
  access_token: string;
  refresh_token?: string;
  open_id?: string;
  scope?: string;
  expires_in?: number;
  refresh_expires_in?: number;
}

export interface TikTokUserInfo {
  openId: string;
  displayName: string;
  avatarUrl: string | null;
  followers: string | null;
}

function base64url(buf: Buffer): string { return buf.toString('base64url'); }

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function signTikTokState(state: TikTokOAuthState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyTikTokState(token: string, secret: string, now = Date.now()): TikTokOAuthState | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig !== expect) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TikTokOAuthState;
    if (typeof state.exp !== 'number' || state.exp < now) return null;
    if (!state.verifier) return null;
    return state;
  } catch { return null; }
}

export function newTikTokState(orgId: string, userId: string, verifier: string): TikTokOAuthState {
  return { orgId, userId, nonce: randomUUID(), verifier, exp: Date.now() + 10 * 60_000 };
}

export function buildTikTokAuthorizeUrl(clientKey: string, redirectUri: string, state: string, challenge: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set('client_key', clientKey);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', TK_SCOPES.join(','));
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export async function exchangeTikTokCode(
  code: string,
  clientKey: string,
  clientSecret: string,
  redirectUri: string,
  verifier: string,
): Promise<TikTokTokenBundle> {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json().catch(() => null)) as (TikTokTokenBundle & { error?: string; error_description?: string; message?: string }) | null;
  if (!res.ok || !data?.access_token) {
    throw new Error(`tiktok token ${res.status}: ${data?.error_description ?? data?.error ?? data?.message ?? 'no access_token'}`);
  }
  return data;
}

export async function refreshTikTokToken(refreshToken: string, clientKey: string, clientSecret: string): Promise<TikTokTokenBundle> {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json().catch(() => null)) as (TikTokTokenBundle & { error?: string; error_description?: string }) | null;
  if (!res.ok || !data?.access_token) {
    throw new Error(`tiktok refresh ${res.status}: ${data?.error_description ?? data?.error ?? 'refresh failed'}`);
  }
  return data;
}

export async function fetchTikTokUser(accessToken: string): Promise<TikTokUserInfo> {
  const u = new URL(USERINFO_URL);
  u.searchParams.set('fields', 'open_id,display_name,avatar_url,follower_count');
  const res = await fetch(u, { headers: { authorization: `Bearer ${accessToken}` } });
  const data = (await res.json().catch(() => null)) as {
    data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string; follower_count?: number } };
    error?: { code?: string; message?: string };
  } | null;
  const user = data?.data?.user;
  if (!res.ok || !user?.open_id) {
    throw new Error(`tiktok user.info ${res.status}: ${data?.error?.message ?? 'no user returned'}`);
  }
  return {
    openId: user.open_id,
    displayName: user.display_name ?? 'TikTok Creator',
    avatarUrl: user.avatar_url ?? null,
    followers: user.follower_count != null ? String(user.follower_count) : null,
  };
}

export async function revokeTikTokToken(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

// ── Publish helpers ───────────────────────────────────────────────────────
// TikTok Content Posting API (v2) — init + upload + publish.
// We expose init + status helpers for PublishService to orchestrate.

export interface TikTokInitResponse {
  publishId: string;
  uploadUrl: string;
}

export async function initTikTokUpload(
  accessToken: string,
  openId: string,
  videoSize: number,
  caption: string,
  privacyLevel: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY' = 'PUBLIC_TO_EVERYONE',
): Promise<TikTokInitResponse> {
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 2200),
        privacy_level: privacyLevel,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    data?: { publish_id?: string; upload_url?: string };
    error?: { code?: string; message?: string };
  } | null;
  if (!res.ok || !data?.data?.publish_id || !data?.data?.upload_url) {
    throw new Error(`tiktok init ${res.status}: ${data?.error?.message ?? 'no publish_id/upload_url'}`);
  }
  return { publishId: data.data.publish_id, uploadUrl: data.data.upload_url };
}

export async function uploadToTikTok(uploadUrl: string, bytes: Buffer, contentType = 'video/mp4'): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': contentType,
      'content-length': String(bytes.byteLength),
      'content-range': `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
    },
    body: new Uint8Array(bytes),
  });
  if (res.status !== 200 && res.status !== 201 && res.status !== 204) {
    throw new Error(`tiktok upload ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

export type TikTokPublishStatus = 'PROCESSING' | 'PUBLISHED' | 'FAILED';

export async function fetchTikTokPublishStatus(accessToken: string, publishId: string): Promise<{ status: TikTokPublishStatus; failReason?: string }> {
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const data = (await res.json().catch(() => null)) as {
    data?: { status?: string; fail_reason?: string; public_url?: string };
    error?: { message?: string };
  } | null;
  const s = (data?.data?.status ?? '').toUpperCase();
  if (s === 'PUBLISH_COMPLETE' || s === 'PUBLISHED') return { status: 'PUBLISHED' as const };
  if (s === 'FAILED' || s === 'PUBLISH_FAILED') {
    const reason = data?.data?.fail_reason ?? data?.error?.message;
    return reason ? { status: 'FAILED' as const, failReason: reason } : { status: 'FAILED' as const };
  }
  return { status: 'PROCESSING' as const };
}
