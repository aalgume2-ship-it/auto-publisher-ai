/**
 * API client — the ONLY network layer in the web app. Bearer-token only:
 * the visitor's JWT lives in localStorage; no cookies, no server secrets.
 * Error mapping renders the platform's RFC 9457 ProblemDetails codes into
 * Arabic messages (codes come from @aca/shared — the same catalog the API emits).
 *
 * Auto-refresh: when a GET request returns 401 and a refresh token is present,
 * the client silently refreshes the session and retries the request once.
 */
import { ErrorCodes } from '@aca/shared/errors.js'; // browser-safe leaf (no node builtins); root pulls server utils

/**
 * Same-origin by default: all API traffic goes through the Next.js proxy
 * (/api/v1/*) on the SAME host as the web app, so a Vercel deployment needs
 * zero public API host configured on the browser side. NEXT_PUBLIC_API_BASE
 * is kept for deployments that prefer a direct public API origin.
 */
export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, '') ?? '/api';

/** All API calls go through the local Next.js proxy (/api/v1/…). */
const API_PROXY = '/api/v1';

/**
 * Strip a redundant leading `/v1` from a caller-supplied path.
 *
 * The web app has been calling `api.post('/v1/auth/login', …)` everywhere
 * (auth, dashboard, channels, etc.) while the shared base URL is
 * `/api/v1`. Without normalization this concatenated to
 * `/api/v1/v1/auth/login` — which the upstream Render API does not have,
 * producing 404s on every call.
 *
 * Normalize once at the boundary so every existing caller continues to
 * work without having to touch dozens of call-sites.
 */
function normalizePath(path: string): string {
  if (path.startsWith('/v1/')) return path.slice(3); // '/v1/auth/login' → '/auth/login'
  if (path === '/v1') return '';
  return path;
}

export interface ProblemBody {
  type?: string;
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
  meta?: { issues?: unknown };
}

export class ApiProblem extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    public readonly body: ProblemBody,
  ) {
    super(body.detail ?? body.title ?? 'request failed');
    this.name = 'ApiProblem';
  }
}

const CODE_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: 'بيانات الدخول غير صحيحة أو انتهت الجلسة — تحقق وحاول مجدداً',
  CONFLICT: 'يوجد تعارض — ربما البريد مسجّل مسبقاً',
  RATE_LIMITED: 'محاولات كثيرة — مهلة قصيرة ثم أعد المحاولة',
  FORBIDDEN: 'ليست لديك صلاحية كافية لهذا الإجراء',
  NOT_FOUND: 'العنصر المطلوب غير موجود',
  PLATFORM_ERROR: 'عذراً — هذه الميزة غير مفعّلة على هذا الخادم حالياً',
};

export function arabicMessage(p: ApiProblem | ProblemBody): string {
  const body: ProblemBody = p instanceof ApiProblem ? p.body : p;
  const code = p.code;
  // Some codes carry directly actionable operator details from the backend.
  if (body.detail && (code === 'VALIDATION_FAILED' || code === 'AI_CREDENTIALS_MISSING' || code === 'PLATFORM_ERROR')) return body.detail;
  if (code && code in CODE_MESSAGES) return CODE_MESSAGES[code as keyof typeof CODE_MESSAGES] as string;
  if (ErrorCodes.includes(code as never)) return body.detail ?? 'حدث خطأ غير متوقع';
  return body.detail ?? (p as { message?: string }).message ?? 'تعذّر الاتصال بالخادم — تحقق من الشبكة';
}

/**
 * Attempt to refresh the session token. Returns true if refresh succeeded
 * and the caller should retry their request.
 */
async function tryRefreshSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem('aca.session.v1');
    if (!raw) return false;
    const session = JSON.parse(raw) as { refreshToken?: string; accessToken?: string };
    if (!session.refreshToken) return false;

    const res = await fetch(`${API_PROXY}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });

    if (!res.ok) {
      // Refresh failed — clear session so user is redirected to login
      window.localStorage.removeItem('aca.session.v1');
      return false;
    }

    const json = (await res.json()) as {
      user: { email: string; displayName: string };
      tokens: { accessToken: string; refreshToken: string };
    };

    // Update stored session with new tokens
    const updated = {
      ...session,
      accessToken: json.tokens.accessToken,
      refreshToken: json.tokens.refreshToken,
      email: json.user.email,
      displayName: json.user.displayName,
    };
    window.localStorage.setItem('aca.session.v1', JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

/** Get the current access token from storage (for retry after refresh) */
function getCurrentToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('aca.session.v1');
    if (!raw) return null;
    const session = JSON.parse(raw) as { accessToken?: string };
    return session.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Mutations are @Idempotent() on the API and REQUIRE an Idempotency-Key
 * header (400 otherwise). The browser has no natural key, so mint one per
 * mutating request — unique per call, satisfies the contract, and keeps
 * accidental double-clicks from replaying (the API dedupes by key+payload).
 */
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function request<T>(
  method: string,
  path: string,
  opts: { token?: string | null; body?: unknown; isRetry?: boolean } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PROXY}${normalizePath(path)}`, {
      method,
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' && method !== 'HEAD' ? { 'Idempotency-Key': newIdempotencyKey() } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
    });
  } catch {
    throw new ApiProblem(0, undefined, { detail: 'تعذّر الوصول إلى الخادم — تحقق من اتصالك وأعد المحاولة' });
  }

  // Auto-refresh on 401 for GET requests (idempotent, safe to retry)
  if (res.status === 401 && method === 'GET' && !opts.isRetry && opts.token) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      const newToken = getCurrentToken();
      if (newToken) {
        return request<T>(method, path, { ...opts, token: newToken, isRetry: true });
      }
    }
  }

  const text = await res.text();
  // Parse defensively — if the proxy or CDN hands us a non-JSON body
  // (e.g. a Vercel auth redirect page, or a 502 HTML), we still want
  // to surface an `ApiProblem` with the raw text instead of throwing
  // a SyntaxError that callers (login/register) misclassify as
  // "تعذّر الاتصال".
  let json: ProblemBody = {};
  if (text.length > 0) {
    try {
      json = JSON.parse(text) as ProblemBody;
    } catch {
      json = { title: res.statusText || 'Unexpected response', detail: text.slice(0, 240) };
    }
  }
  if (!res.ok) throw new ApiProblem(res.status, json.code, json);
  return json as T;
}

export const api = {
  get: <T>(path: string, token?: string | null) => request<T>('GET', path, { ...(token !== undefined ? { token } : {}) }),
  post: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>('POST', path, { body, ...(token !== undefined ? { token } : {}) }),
  put: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>('PUT', path, { body, ...(token !== undefined ? { token } : {}) }),
  patch: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>('PATCH', path, { body, ...(token !== undefined ? { token } : {}) }),
  del: <T>(path: string, token?: string | null) => request<T>('DELETE', path, { ...(token !== undefined ? { token } : {}) }),
  health: () => request<{ status: string; version?: string; env?: string }>('GET', '/health'),
};
