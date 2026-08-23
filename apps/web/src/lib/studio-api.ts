/**
 * Lumen Studio — production API client (real backend only).
 *
 * Talks to the real AutoCreator backend through the same-origin serverless
 * proxy at /api/v1/* (see app/api/v1/[...path]/route.ts). The upstream origin
 * is set with API_UPSTREAM / NEXT_PUBLIC_API_URL at deploy time — the browser
 * never sees it.
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
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface CallOptions {
  idempotencyKey?: string;
  maxAttempts?: number;
  timeoutMs?: number;
}

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
  options: CallOptions = {},
): Promise<ApiResult<T>> {
  const finalPath = `${API_BASE}${normalizePath(path)}`;
  const isAuth = path.includes('/auth/');
  const maxAttempts = options.maxAttempts ?? (isAuth ? 2 : 2);
  const timeoutMs = options.timeoutMs ?? (isAuth ? 12000 : 10000);
  const idempotencyKey = options.idempotencyKey ?? (
    method !== 'GET' && method !== 'HEAD'
      ? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
      : undefined
  );

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
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        },
        timeoutMs,
      );

      const contentType = res.headers.get('content-type');
      const text = await res.text();
      let json: unknown = null;
      if (text) {
        try { json = JSON.parse(text); } catch { json = null; }
      }

      if (isColdStartResponse(res.status, text, contentType)) {
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
          lastError = { ok: false, reachable: false, error: { kind: 'cold_start', status: res.status, detail: 'cold start - retrying' } };
          continue;
        }
        return {
          ok: false,
          reachable: false,
          error: {
            kind: 'cold_start',
            status: res.status,
            code: typeof (json as { code?: unknown } | null)?.code === 'string' ? (json as { code: string }).code : 'COLD_START',
            detail: typeof (json as { detail?: unknown } | null)?.detail === 'string' ? (json as { detail: string }).detail : 'Service is unavailable',
          },
        };
      }

      if (!res.ok) {
        const pb = (json ?? {}) as { code?: string; detail?: string };
        if ((res.status === 502 || res.status === 503) && attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
          lastError = { ok: false, reachable: false, error: { kind: 'cold_start', status: res.status, code: pb.code, detail: pb.detail || 'upstream unavailable' } };
          continue;
        }
        return { ok: false, reachable: true, error: { kind: 'http', status: res.status, code: pb.code, detail: pb.detail } };
      }
      return { ok: true, reachable: true, data: json as T };
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
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
  }, null, { maxAttempts: 2, timeoutMs: 12000 });
}

export function login(email: string, password: string) {
  return call<{ kind: 'tokens'; user: AuthUser; tokens: AuthTokens } | { kind: 'mfa_required'; mfaTicket: string }>('POST', '/auth/login', { email, password }, null, { maxAttempts: 2, timeoutMs: 12000 });
}

export function refresh(refreshToken: string) {
  return call<{ user: AuthUser; tokens: AuthTokens }>('POST', '/auth/refresh', { refreshToken }, null, { maxAttempts: 2, timeoutMs: 10000 });
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
  failureReason?: string | null;
  seo?: { step?: string; progress?: number } | null;
  createdAt: string;
  streamUrl?: string | null;
  renditions?: Array<{ status: string; url?: string }>;
}

export interface GenerateVideoDto {
  video?: { id?: string; status?: string };
  id?: string;
  jobId?: string;
}

export function createSeries(token: string, orgId: string, name: string) {
  return call<SeriesDto>('POST', `/organizations/${orgId}/series`, { name, niche: 'generic', cadencePerWeek: 1, language: 'en' }, token);
}
export function listSeries(token: string, orgId: string) {
  return call<{ items: SeriesDto[] }>('GET', `/organizations/${orgId}/series`, undefined, token);
}
export function generateVideo(token: string, orgId: string, seriesId: string, keyword: string, targetSeconds: number) {
  return call<GenerateVideoDto>('POST', `/organizations/${orgId}/series/${seriesId}/videos`, { keyword, targetSeconds }, token);
}
export function listVideos(token: string, orgId: string) {
  return call<{ items: VideoDto[] }>('GET', `/organizations/${orgId}/videos`, undefined, token);
}
export function getVideo(token: string, orgId: string, videoId: string) {
  return call<VideoDto>('GET', `/organizations/${orgId}/videos/${videoId}`, undefined, token);
}
export function videoStreamUrl(orgId: string, videoId: string, _token: string) {
  return `/api/v1/organizations/${orgId}/videos/${videoId}/stream`;
}
export function regenerateVideo(token: string, orgId: string, videoId: string) {
  return call<{ jobId?: string }>('POST', `/organizations/${orgId}/videos/${videoId}/regenerate`, undefined, token);
}

/**
 * Turn API media URLs into browser-facing URLs.
 *
 * The API returns signed local media links as `/v1/media/raw?...`, while the
 * web application reaches that API through its same-origin `/api/v1` proxy.
 * Treating the signed link as unusable forced the client to rebuild the whole
 * MP4 in memory and produced a permanent spinner on mobile browsers.
 */
export function playableVideoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^https:\/\//i.test(value)) return value;
  if (value.startsWith('/api/v1/')) return value;
  if (value.startsWith('/v1/')) return `/api${value}`;
  return null;
}

export async function fetchStreamBlob(orgId: string, videoId: string, token: string): Promise<{ blob: Blob | null; url: string } | null> {
  try {
    // Prefer the public Bunny CDN mirror when configured. It supports native
    // Range playback and avoids rebuilding a large MP4 in browser memory.
    const video = await getVideo(token, orgId, videoId);
    const directUrl = video.ok ? video.data?.streamUrl : null;
    const playableUrl = playableVideoUrl(directUrl);
    if (playableUrl) {
      return { blob: null, url: playableUrl };
    }
    // Keep MP4 bytes text-safe across every serverless boundary: the API reads
    // storage and emits Base64 JSON directly, then the browser rebuilds bytes.
    const chunkSize = 512 * 1024 - 2; // divisible by 3, so Base64 chunks join exactly
    const chunks: Uint8Array[] = [];
    let start = 0;
    let total: number | null = null;
    let expectedSha256: string | null = null;
    while (total === null || start < total) {
      const target = `/api/v1/organizations/${orgId}/videos/${videoId}/stream-chunk?start=${start}&size=${chunkSize}`;
      const res = await fetch(target, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const body = await res.json() as { base64?: string; start?: number; end?: number; total?: number; sha256?: string };
      if (!body.base64) return null;
      const raw = atob(body.base64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
      chunks.push(bytes);
      if (start === 0 && typeof body.sha256 === 'string') expectedSha256 = body.sha256;
      if (Number.isFinite(body.total)) total = Number(body.total);
      const reportedStart = Number(body.start);
      const reportedEnd = Number(body.end);
      if (reportedStart !== start || reportedEnd !== start + bytes.byteLength) return null;
      start = reportedEnd;
      if (bytes.byteLength === 0 || (total === null && bytes.byteLength < chunkSize)) total = start;
    }
    const blob = new Blob(chunks as BlobPart[], { type: 'video/mp4' });
    if (total !== null && blob.size !== total) return null;
    if (expectedSha256 && globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== expectedSha256) return null;
    }
    return { blob, url: URL.createObjectURL(blob) };
  } catch { return null; }
}

/* ------------------------------------------------------------- billing --- */

export function createCheckout(token: string, orgId: string, planCode: string, successPath: string) {
  return call<{ url?: string }>('PUT', `/organizations/${orgId}/checkout-session`, { planCode, interval: 'month', successUrl: successPath, cancelUrl: `${window.location.origin}/subscribe` }, token);
}

/* ------------------------------------------------------ OAuth (env-gated) */

export const OAUTH_GOOGLE_URL = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_URL || '';
export const OAUTH_APPLE_URL = process.env.NEXT_PUBLIC_APPLE_OAUTH_URL || '';
export const oauthEnabled = (p: 'google' | 'apple') => (p === 'google' ? !!OAUTH_GOOGLE_URL : !!OAUTH_APPLE_URL);
