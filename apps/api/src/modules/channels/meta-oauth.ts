/**
 * Meta (Instagram) OAuth 2.0 + Graph API — REAL client (plain fetch).
 * Flow: /link → consent URL (HMAC state, no PKCE — Meta uses OAuth 2.0
 * authorization code with client secret) → callback → code exchange at
 * graph.facebook.com/v21.0/oauth/access_token → long-lived token exchange
 * → Instagram Business account discovery → encrypted credential at rest.
 */
import { createHmac, randomUUID } from 'node:crypto';

export const IG_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_comments'] as const;

const AUTH_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
const TOKEN_URL = 'https://graph.facebook.com/v21.0/oauth/access_token';
const GRAPH = 'https://graph.facebook.com/v21.0';

export interface MetaOAuthState {
  orgId: string;
  userId: string;
  nonce: string;
  exp: number;
}

export interface MetaTokenBundle {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface InstagramAccount {
  instagramBusinessAccountId: string;
  username: string | null;
  name: string | null;
  followers: string | null;
  profilePictureUrl: string | null;
}

export function signMetaState(state: MetaOAuthState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyMetaState(token: string, secret: string, now = Date.now()): MetaOAuthState | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig !== expect) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as MetaOAuthState;
    if (typeof state.exp !== 'number' || state.exp < now) return null;
    return state;
  } catch { return null; }
}

export function newMetaState(orgId: string, userId: string): MetaOAuthState {
  return { orgId, userId, nonce: randomUUID(), exp: Date.now() + 10 * 60_000 };
}

export function buildMetaAuthorizeUrl(appId: string, redirectUri: string, state: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set('client_id', appId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', IG_SCOPES.join(','));
  u.searchParams.set('state', state);
  return u.toString();
}

/** Short-lived code → short-lived access token. */
export async function exchangeMetaCode(appId: string, appSecret: string, redirectUri: string, code: string): Promise<MetaTokenBundle> {
  const u = new URL(TOKEN_URL);
  u.searchParams.set('client_id', appId);
  u.searchParams.set('client_secret', appSecret);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('code', code);
  const res = await fetch(u.toString(), { method: 'GET' });
  const data = (await res.json()) as MetaTokenBundle & { error?: { message?: string } };
  if (!res.ok || !data.access_token) {
    throw new Error(`meta token exchange ${res.status}: ${data.error?.message ?? 'no access token'}`);
  }
  return data;
}

/** Short-lived → long-lived (60 days) token. */
export async function exchangeLongLivedToken(appId: string, appSecret: string, shortToken: string): Promise<MetaTokenBundle> {
  const u = new URL(TOKEN_URL);
  u.searchParams.set('grant_type', 'fb_exchange_token');
  u.searchParams.set('client_id', appId);
  u.searchParams.set('client_secret', appSecret);
  u.searchParams.set('fb_exchange_token', shortToken);
  const res = await fetch(u.toString(), { method: 'GET' });
  const data = (await res.json()) as MetaTokenBundle & { error?: { message?: string } };
  if (!res.ok || !data.access_token) {
    throw new Error(`meta long-lived exchange ${res.status}: ${data.error?.message ?? 'no access token'}`);
  }
  return data;
}

/**
 * Discover the connected Instagram Business account:
 * me?fields=id,name,username → /{ig-user-id}?fields=instagram_business_account
 */
export async function fetchInstagramAccount(accessToken: string): Promise<InstagramAccount> {
  const me = await fetch(`${GRAPH}/me?fields=id,name,username&access_token=${encodeURIComponent(accessToken)}`);
  const meData = (await me.json()) as { id?: string; name?: string; username?: string; error?: { message?: string } };
  if (!me.ok || !meData.id) {
    throw new Error(`meta me ${me.status}: ${meData.error?.message ?? 'no id'}`);
  }
  // Instagram Business account discovery (Facebook Page linked to IG)
  const ig = await fetch(
    `${GRAPH}/${meData.id}?fields=instagram_business_account{id,username,name,profile_picture_url,followers_count}&access_token=${encodeURIComponent(accessToken)}`,
  );
  const igData = (await ig.json()) as {
    instagram_business_account?: { id?: string; username?: string; name?: string; profile_picture_url?: string; followers_count?: number };
    error?: { message?: string };
  };
  if (!ig.ok || !igData.instagram_business_account?.id) {
    throw new Error(`meta ig discovery ${ig.status}: ${igData.error?.message ?? 'no linked instagram business account'}`);
  }
  const acc = igData.instagram_business_account;
  return {
    instagramBusinessAccountId: acc.id!,
    username: acc.username ?? null,
    name: acc.name ?? null,
    followers: acc.followers_count != null ? String(acc.followers_count) : null,
    profilePictureUrl: acc.profile_picture_url ?? null,
  };
}

export async function revokeMetaToken(accessToken: string): Promise<void> {
  await fetch(`${GRAPH}/me/permissions?access_token=${encodeURIComponent(accessToken)}`, { method: 'DELETE' }).catch(() => undefined);
}

