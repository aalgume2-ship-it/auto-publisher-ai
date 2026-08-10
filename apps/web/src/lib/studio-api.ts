/**
 * Lumen Studio — production API client (real backend only).
 *
 * Talks to the real AutoCreator backend through the same-origin serverless
 * proxy at /api/v1/* (see app/api/v1/[...path]/route.ts). The upstream origin
 * is set with API_UPSTREAM / NEXT_PUBLIC_API_URL at deploy time — the browser
 * never sees it.
 *
 * Every call returns a typed ApiResult. `reachable:false` means the backend
 * could not be reached — callers keep the UI in a friendly "Processing…"
 * state and retry automatically; the product never shows "API Unreachable"
 * or "Cold Start" to the user.
 *
 * Robustness upgrade: timeout (15s), cold-start detection (HTML or 502/503),
 * automatic retry with backoff (up to 3 attempts for auth, 2 for others).
 */

export const API_BASE = '/api/v1';

export interface StudioApiError {
  kind: 'http' | 'network' | 'cold_start';
  status?: number;
  code?: string;
  detail?: string;
}

export interface ApiResult<T> {
  ok: boolean;
  reachable: boolean;
  data?: T;
  error?: StudioApiError;
}

function normalizePath(path: string): string {
  if (path.startsWith('/v1/')) return path.slice(3);
  if (path === '/v1') return '';
  return path;
}

function isColdStartResponse(status: number, text: string, contentType: string | null): boolean {
  if (status === 502 || status === 503) {
    const t = text.slice(0, 2000).toLowerCase();
    if (t.includes('cold') || t.includes('waking') || t.includes('unreachable') || t.includes('application loading')) return true;
    // If 502/503 and not JSON, likely cold start
    if (contentType && contentType.includes('text/html')) return true;
    if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) return true;
  }
  if (contentType && contentType.includes('text/html')) return true;
  const lower = text.slice(0, 2000).toLowerCase();
  return lower.includes('application loading') || lower.includes('service waking up') || lower.includes('allocating compute');
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
): Promise<ApiResult<T>> {
  const finalPath = `${API_BASE}${normalizePath(path)}`;
  // For auth, we retry more aggressively because cold start happens often on first login
  const isAuth = path.includes('/auth/');
  const maxAttempts = isAuth ? 4 : 3;
  const timeoutMs = isAuth ? 20000 : 15000;

  let lastError: ApiResult<T> | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetchWithTimeout(
        finalPath,
        {
          method,
          headers: {
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(method !== 'GET' && method !== 'HEAD' ? { 'Idempotency-Key': (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`) } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        },
        timeoutMs,
      );

      const contentType = res.headers.get('content-type');
      const text = await res.text();
      let json: any = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }

      // Cold start detection - treat HTML or specific 502/503 as retryable network issue
      if (isColdStartResponse(res.status, text, contentType)) {
        // If this is not the last attempt, wait and retry
        if (attempt < maxAttempts - 1) {
          const delay = 2000 * Math.pow(1.7, attempt); // 2s, 3.4s, 5.8s, 9.8s
          await new Promise((r) => setTimeout(r, delay));
          lastError = { ok: false, reachable: false, error: { kind: 'cold_start', status: res.status, detail: 'cold start - retrying' } };
          continue;
        }
        // Final attempt - return as cold_start / unreachable
        return {
          ok: false,
          reachable: false,
          error: { kind: 'cold_start', status: res.status, code: json?.code || 'COLD_START', detail: 'Service is waking up' },
        };
      }

      if (!res.ok) {
        const pb = (json ?? {}) as { code?: string; detail?: string };
        // For 502/503 that are JSON (our proxy's COLD_START JSON), treat as retryable if auth and not last attempt
        if ((res.status === 502 || res.status === 503) && isAuth && attempt < maxAttempts - 1) {
          const delay = 2500 * Math.pow(1.5, attempt);
          await new Promise((r) => setTimeout(r, delay));
          lastError = { ok: false, reachable: false, error: { kind: 'cold_start', status: res.status, code: pb.code, detail: pb.detail || 'upstream waking' } };
          continue;
        }
        return { ok: false, reachable: true, error: { kind: 'http', status: res.status, code: pb.code, detail: pb.detail } };
      }
      return { ok: true, reachable: true, data: json as T };
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      if (attempt < maxAttempts - 1) {
        const delay = 2000 * Math.pow(1.6, attempt);
        await new Promise((r) => setTimeout(r, delay));
        lastError = { ok: false, reachable: false, error: { kind: 'network', detail: isTimeout ? 'timeout - retrying' : 'backend unreachable - retrying' } };
        continue;
      }
      return { ok: false, reachable: false, error: { kind: 'network', detail: isTimeout ? 'Request timed out' : 'backend unreachable' } };
    }
  }
  return lastError ?? { ok: false, reachable: false, error: { kind: 'network', detail: 'backend unreachable' } };
}

/* ---------------------------------------------------------------- auth --- */

export interface AuthTokens { accessToken: string; refreshToken: string; }
export interface AuthUser { id: string; email: string; displayName: string; }

export function register(email: string, password: string, displayName: string) {
  return call<{ user: AuthUser; tokens: AuthTokens; workspace?: { id: string } | null }>('POST', '/auth/register', {
    email, password, displayName, locale: 'en', timezone: 'UTC',
  });
}

export function login(email: string, password: string) {
  return call<{ kind: 'tokens'; user: AuthUser; tokens: AuthTokens } | { kind: 'mfa_required'; mfaTicket: string }>('POST', '/auth/login', { email, password });
}

export function refresh(refreshToken: string) {
  return call<{ user: AuthUser; tokens: AuthTokens }>('POST', '/auth/refresh', { refreshToken });
}

/* ------------------------------------------------------------- orgs ------ */

export interface OrgDto { id: string; name: string; slug: string; status: string; timezone: string; defaultLocale: string; }
export interface OrgMembership { role: string; status: string; organization: OrgDto; }

export function listOrgs(token: string) {
  return call<{ items: OrgMembership[] }>('GET', '/organizations', undefined, token);
}
export function createOrg(token: string, name: string) {
  return call<OrgDto>('POST', '/organizations', { name, timezone: 'UTC', defaultLocale: 'en' }, token);
}

/* ------------------------------------------------------------- videos ---- */

export interface SeriesDto { id: string; name: string; niche: string; status: string; }
export interface VideoDto {
  id: string;
  status: string;
  keyword?: string;
  createdAt: string;
  renditions?: Array<{ status: string; url?: string }>;
  streamUrl?: string;
  failureReason?: string;
  provider?: string;
  model?: string;
  durationSec?: number;
  width?: number;
  height?: number;
}

export function createSeries(token: string, orgId: string, name: string) {
  return call<SeriesDto>('POST', `/organizations/${orgId}/series`, { name, niche: 'generic', cadencePerWeek: 1, language: 'en' }, token);
}
export function listSeries(token: string, orgId: string) {
  return call<{ items: SeriesDto[] }>('GET', `/organizations/${orgId}/series`, undefined, token);
}
export function generateVideo(token: string, orgId: string, seriesId: string, keyword: string, targetSeconds: number) {
  return call<{ id: string; status: string }>('POST', `/organizations/${orgId}/series/${seriesId}/videos`, { keyword, targetSeconds }, token);
}
export function listVideos(token: string, orgId: string) {
  return call<{ items: VideoDto[] }>('GET', `/organizations/${orgId}/videos`, undefined, token);
}
export function getVideo(token: string, orgId: string, videoId: string) {
  return call<VideoDto>('GET', `/organizations/${orgId}/videos/${videoId}`, undefined, token);
}
export function videoStreamUrl(orgId: string, videoId: string, token: string) {
  return `/api/v1/organizations/${orgId}/videos/${videoId}/stream`;
}
export function regenerateVideo(token: string, orgId: string, videoId: string) {
  return call<{ jobId?: string }>('POST', `/organizations/${orgId}/videos/${videoId}/regenerate`, undefined, token);
}

/** Fetch an authenticated video blob (stream requires the Bearer header). */
export async function fetchStreamBlob(orgId: string, videoId: string, token: string): Promise<{ blob: Blob; url: string } | null> {
  try {
    const res = await fetch(videoStreamUrl(orgId, videoId, token), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const blob = await res.blob();
    return { blob, url: URL.createObjectURL(blob) };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- billing --- */

export function createCheckout(token: string, orgId: string, planCode: string, successPath: string) {
  return call<{ url?: string }>('PUT', `/organizations/${orgId}/checkout-session`, { planCode, interval: 'month', successUrl: successPath, cancelUrl: `${window.location.origin}/subscribe` }, token);
}

/* ------------------------------------------------------ OAuth (env-gated) */

export const OAUTH_GOOGLE_URL = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_URL || '';
export const OAUTH_APPLE_URL = process.env.NEXT_PUBLIC_APPLE_OAUTH_URL || '';
export const oauthEnabled = (p: 'google' | 'apple') => (p === 'google' ? !!OAUTH_GOOGLE_URL : !!OAUTH_APPLE_URL);
