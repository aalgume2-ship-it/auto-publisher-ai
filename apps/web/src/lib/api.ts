/**
 * API client — the ONLY network layer in the web app. Bearer-token only:
 * the visitor's JWT lives in localStorage; no cookies, no server secrets.
 * Error mapping renders the platform's RFC 9457 ProblemDetails codes into
 * Arabic messages (codes come from @aca/shared — the same catalog the API emits).
 *
 * Auto-refresh: when a GET request returns 401 and a refresh token is present,
 * the client silently refreshes the session and retries the request once.
 *
 * Robustness: timeout (15-20s), cold-start detection (HTML), auto-retry with backoff.
 */
import { ErrorCodes } from '@aca/shared/errors.js';

export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, '') ?? '/api';

const API_PROXY = '/api/v1';

function normalizePath(path: string): string {
  if (path.startsWith('/v1/')) return path.slice(3);
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
  COLD_START: 'الخدمة تستيقظ الآن — نعيد المحاولة تلقائياً',
  UPSTREAM_UNREACHABLE: 'الخدمة غير متاحة مؤقتاً — نعيد المحاولة تلقائياً',
};

export function arabicMessage(p: ApiProblem | ProblemBody): string {
  const body: ProblemBody = p instanceof ApiProblem ? p.body : p;
  const code = (p as ApiProblem).code ?? body.code;
  if (code === 'COLD_START' || code === 'UPSTREAM_UNREACHABLE') {
    return 'الخدمة تستيقظ الآن — ثوانٍ ونعيد المحاولة تلقائياً';
  }
  if (body.detail && (code === 'VALIDATION_FAILED' || code === 'AI_CREDENTIALS_MISSING' || code === 'PLATFORM_ERROR')) return body.detail;
  if (code && code in CODE_MESSAGES) return CODE_MESSAGES[code as keyof typeof CODE_MESSAGES] as string;
  if (code && ErrorCodes.includes(code as never)) return body.detail ?? 'حدث خطأ غير متوقع';
  return body.detail ?? (p as { message?: string }).message ?? 'تعذّر الاتصال بالخادم — تحقق من الشبكة';
}

async function tryRefreshSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem('aca.session.v1');
    if (!raw) return false;
    const session = JSON.parse(raw) as { refreshToken?: string; accessToken?: string };
    if (!session.refreshToken) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${API_PROXY}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      window.localStorage.removeItem('aca.session.v1');
      return false;
    }

    const json = (await res.json()) as {
      user: { email: string; displayName: string };
      tokens: { accessToken: string; refreshToken: string };
    };

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

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isColdStartText(text: string): boolean {
  const t = text.slice(0, 3000).toLowerCase();
  return (
    t.includes('application loading') ||
    t.includes('service waking up') ||
    t.includes('allocating compute') ||
    (t.includes('<!doctype') && t.includes('<html')) ||
    (t.includes('<html') && t.includes('render'))
  );
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

async function request<T>(
  method: string,
  path: string,
  opts: { token?: string | null; body?: unknown; isRetry?: boolean } = {},
): Promise<T> {
  const isAuth = path.includes('/auth/');
  const maxAttempts = isAuth ? 4 : 3;
  const timeoutMs = isAuth ? 20000 : 15000;

  let lastProblem: ApiProblem | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${API_PROXY}${normalizePath(path)}`, {
        method,
        headers: {
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(method !== 'GET' && method !== 'HEAD' ? { 'Idempotency-Key': newIdempotencyKey() } : {}),
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
      }, timeoutMs);
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      if (attempt < maxAttempts - 1) {
        const delay = 2000 * Math.pow(1.6, attempt);
        await new Promise((r) => setTimeout(r, delay));
        lastProblem = new ApiProblem(0, 'UPSTREAM_UNREACHABLE', { detail: isTimeout ? 'انتهت مهلة الطلب - نعيد المحاولة' : 'تعذر الوصول - نعيد المحاولة' });
        continue;
      }
      throw new ApiProblem(0, undefined, { detail: 'تعذّر الوصول إلى الخادم — تحقق من اتصالك وأعد المحاولة' });
    }

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
    if (isColdStartText(text) && (res.status === 502 || res.status === 503 || res.status === 200)) {
      // Detect HTML interstitial as cold start
      if (attempt < maxAttempts - 1) {
        const delay = 2500 * Math.pow(1.6, attempt);
        await new Promise((r) => setTimeout(r, delay));
        lastProblem = new ApiProblem(res.status, 'COLD_START', { detail: 'الخدمة تستيقظ الآن - نعيد المحاولة' });
        continue;
      }
      throw new ApiProblem(res.status, 'COLD_START', { detail: 'الخدمة تستيقظ الآن - حاول مرة أخرى بعد ثوانٍ' });
    }

    let json: ProblemBody = {};
    if (text.length > 0) {
      try {
        json = JSON.parse(text) as ProblemBody;
      } catch {
        json = { title: res.statusText || 'Unexpected response', detail: text.slice(0, 240) };
      }
    }

    // If 502/503 with JSON code COLD_START, retry
    if ((res.status === 502 || res.status === 503) && (json.code === 'COLD_START' || json.code === 'UPSTREAM_UNREACHABLE')) {
      if (attempt < maxAttempts - 1) {
        const delay = 2500 * Math.pow(1.5, attempt);
        await new Promise((r) => setTimeout(r, delay));
        lastProblem = new ApiProblem(res.status, json.code, json);
        continue;
      }
    }

    if (!res.ok) throw new ApiProblem(res.status, json.code, json);
    return json as T;
  }
  throw lastProblem ?? new ApiProblem(0, 'UPSTREAM_UNREACHABLE', { detail: 'تعذر الاتصال بعد عدة محاولات' });
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
