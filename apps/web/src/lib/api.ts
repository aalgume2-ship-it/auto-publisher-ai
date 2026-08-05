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
 * Phase 1: the web app talks to its own /api/v1/* Route Handlers which proxy
 * to the Render API.  The browser never contacts Render directly for auth or
 * health.  API_BASE is kept for asset URLs (media, thumbnails) that are still
 * served directly from the upstream.
 */
export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, '') ?? 'https://autocreator-api-preview.onrender.com';

/** All API calls go through the local Next.js proxy (/api/v1/…). */
const API_PROXY = '/api/v1';

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

async function request<T>(
  method: string,
  path: string,
  opts: { token?: string | null; body?: unknown; isRetry?: boolean } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_PROXY}${path}`, {
      method,
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
    });
  } catch {
    throw new ApiProblem(0, undefined, { detail: 'تعذّر الوصول إلى الخادم (قد تكون النسخة المجانية في طور الإيقاظ — أعد المحاولة بعد لحظات)' });
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
  const json: unknown = text.length > 0 ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiProblem(res.status, (json as ProblemBody).code, json as ProblemBody);
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
