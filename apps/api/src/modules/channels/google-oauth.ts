/**
 * Google OAuth 2.0 + YouTube Data API v3 — REAL client (no SDK, plain fetch).
 * Flow: /link → consent URL (state = HMAC-signed org/user binding) → Google
 * redirects to our callback → code exchange at oauth2.googleapis.com/token →
 * youtube.channels?mine=true → encrypted credential at rest.
 */
import { createHmac, randomUUID } from 'node:crypto';

export const YT_SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'] as const;

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';

export interface OAuthState {
  orgId: string;
  userId: string;
  nonce: string;
  exp: number; // ms epoch
}

export function signState(state: OAuthState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyState(token: string, secret: string, now = Date.now()): OAuthState | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig !== expect) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
    if (typeof state.exp !== 'number' || state.exp < now) return null;
    return state;
  } catch {
    return null;
  }
}

export function newState(orgId: string, userId: string): OAuthState {
  return { orgId, userId, nonce: randomUUID(), exp: Date.now() + 10 * 60_000 };
}

export function buildAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', YT_SCOPES.join(' '));
  u.searchParams.set('access_type', 'offline'); // → refresh_token
  u.searchParams.set('prompt', 'consent');      // refresh_token on every re-link
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('state', state);
  return u.toString();
}

export interface TokenBundle {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  token_type?: string;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenBundle> {
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const data = (await res.json().catch(() => null)) as (TokenBundle & { error?: string; error_description?: string }) | null;
  if (!res.ok || !data?.access_token) {
    throw new Error(`google token endpoint ${res.status}: ${data?.error_description ?? data?.error ?? 'no access_token'}`);
  }
  return data;
}

export function exchangeCode(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<TokenBundle> {
  return tokenRequest(
    new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  );
}

export function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<TokenBundle> {
  return tokenRequest(
    new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }),
  );
}

export async function revokeToken(token: string): Promise<void> {
  // Best effort by design (Google returns 200 even for expired tokens).
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined);
}

export interface YouTubeChannelInfo {
  platformChannelId: string;
  title: string;
  handle: string | null;
  avatarUrl: string | null;
  followers: string | null; // BigInt-safe string
}

export async function fetchMyChannel(accessToken: string): Promise<YouTubeChannelInfo> {
  const u = new URL(CHANNELS_URL);
  u.searchParams.set('part', 'snippet,statistics');
  u.searchParams.set('mine', 'true');
  const res = await fetch(u, { headers: { authorization: `Bearer ${accessToken}` } });
  const data = (await res.json().catch(() => null)) as
    | { items?: Array<{ id: string; snippet: { title: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> }; statistics?: { subscriberCount?: string } }>; error?: { message?: string } }
    | null;
  const ch = data?.items?.[0];
  if (!res.ok || !ch) {
    throw new Error(`youtube channels.list ${res.status}: ${data?.error?.message ?? 'no channel returned'}`);
  }
  return {
    platformChannelId: ch.id,
    title: ch.snippet.title,
    handle: ch.snippet.customUrl ?? null,
    avatarUrl: ch.snippet.thumbnails?.default?.url ?? ch.snippet.thumbnails?.medium?.url ?? null,
    followers: ch.statistics?.subscriberCount ?? null,
  };
}
