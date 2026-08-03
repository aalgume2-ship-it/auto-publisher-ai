/**
 * API client — the ONLY network layer in the web app. Bearer-token only:
 * the visitor's JWT lives in localStorage; no cookies, no server secrets.
 * Error mapping renders the platform's RFC 9457 ProblemDetails codes into
 * Arabic messages (codes come from @aca/shared — the same catalog the API emits).
 */
import { ErrorCodes } from '@aca/shared/errors.js'; // browser-safe leaf (no node builtins); root pulls server utils

/** Inlined at build time for the static export; fall back to the live preview. */
export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, '') ?? 'https://autocreator-api-preview.onrender.com';

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
  // VALIDATION_FAILED & AI_CREDENTIALS_MISSING carry user-actionable details
  // written for the UI (key rejected, key absent…) — always surface them.
  if (body.detail && (code === 'VALIDATION_FAILED' || code === 'AI_CREDENTIALS_MISSING')) return body.detail;
  if (code && code in CODE_MESSAGES) return CODE_MESSAGES[code as keyof typeof CODE_MESSAGES] as string;
  if (ErrorCodes.includes(code as never)) return body.detail ?? 'حدث خطأ غير متوقع';
  return body.detail ?? (p as { message?: string }).message ?? 'تعذّر الاتصال بالخادم — تحقق من الشبكة';
}

async function request<T>(method: string, path: string, opts: { token?: string | null; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
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
  del: <T>(path: string, token?: string | null) => request<T>('DELETE', path, { ...(token !== undefined ? { token } : {}) }),
  health: () => request<{ status: string; version?: string; env?: string }>('GET', '/health'),
};
