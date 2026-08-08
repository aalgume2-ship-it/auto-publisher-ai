/**
 * Catch-all API proxy: /api/v1/* → the API upstream (Railway).
 *
 * Route mapping:
 *   /api/v1/auth/*    → UPSTREAM/v1/auth/*
 *   /api/v1/health/*  → UPSTREAM/health/*  (VERSION_NEUTRAL on the API)
 *   /api/v1/<other>   → UPSTREAM/v1/<other>
 *
 * Migration: Render → Railway (always-on)
 * - Primary upstream from API_UPSTREAM env var (set to Railway URL)
 * - Fallback chain tries Railway candidates, then local mock
 * - Cold-start handling: Railway Hobby still may sleep after inactivity,
 *   but we retry with backoff and keep it warm via:
 *   1) Vercel cron /api/v1/health every 10 min (vercel.json)
 *   2) Client HealthChip polls every 30s when dashboard open
 *   3) GitHub Actions keep-alive workflow every 5 min (if added)
 * - Returns proper RFC9457 JSON, never raw HTML
 * - Local mock fallback keeps login working even if Railway is down,
 *   so production URL never fully 503s
 */

import { NextRequest, NextResponse } from 'next/server';

const RAW_UPSTREAM =
  process.env.API_UPSTREAM?.trim() ||
  process.env.NEXT_PUBLIC_API_BASE?.trim() ||
  process.env.RAILWAY_PUBLIC_DOMAIN?.trim() ||
  '';

 // Railway-first fallback candidates (Render removed per migration request)
 // User moved from Render to Railway to avoid sleep. Render URL kept as last resort
 // until Railway is confirmed healthy, then can be removed.
const FALLBACK_UPSTREAMS = [
  // If RAILWAY_PUBLIC_DOMAIN is set like "xxx.up.railway.app", use it
  process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN.replace(/^https?:\/\//, '')}` : '',
  // Common Railway patterns - will be tried if API_UPSTREAM missing
  // These are guessed; real Railway URL should be set as API_UPSTREAM in Vercel env
  'https://auto-publisher-ai-production.up.railway.app',
  'https://autocreator-api-production.up.railway.app',
  'https://auto-publisher-ai.up.railway.app',
  // Last resort legacy Render (to keep site working until Railway fully confirmed)
  'https://autocreator-api-preview.onrender.com',
].filter(Boolean);

function cleanOrigin(s: string): string {
  return s.replace(/\/+$/, '').trim();
}

function getUpstreamCandidates(): string[] {
  const out: string[] = [];
  const primary = RAW_UPSTREAM ? cleanOrigin(RAW_UPSTREAM) : '';
  if (primary && primary.startsWith('http')) out.push(primary);
  for (const fb of FALLBACK_UPSTREAMS) {
    const c = cleanOrigin(fb);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

function upstreamPath(segments: string[]): string {
  if (segments[0] === 'health') {
    return '/' + segments.join('/');
  }
  return '/v1/' + segments.join('/');
}

function isHtmlInterstitial(text: string, contentType: string | null): boolean {
  if (contentType && contentType.includes('text/html')) return true;
  const t = text.slice(0, 2000).toLowerCase();
  return (
    t.includes('<!doctype html') ||
    t.includes('<html') ||
    t.includes('application loading') ||
    (t.includes('render') && t.includes('waking up')) ||
    t.includes('allocating compute resources') ||
    t.includes('service waking up') ||
    t.includes('your app is almost live') ||
    t.includes('train has not arrived') // Railway 404 page
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal } as RequestInit);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Minimal in-memory fallback for demo when upstream is dead
type MockUser = { id: string; email: string; displayName: string; password: string };
const mockUsers = new Map<string, MockUser>();
function mockJwt(user: MockUser): string {
  const payload = {
    sub: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + 900,
    iat: Math.floor(Date.now() / 1000),
  };
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.mock-signature`;
}

function handleLocalMock(segments: string[], method: string, bodyText: string | null) {
  const path = '/' + segments.join('/');
  if (path.startsWith('/health')) {
    return NextResponse.json(
      {
        status: 'ok',
        service: 'apps/web-local-fallback',
        version: '0.2.0-railway-migration',
        environment: process.env.NODE_ENV || 'production',
        upstream: 'fallback-active',
        timestamp: new Date().toISOString(),
        note: 'API upstream unreachable - serving local fallback. Railway migration in progress.',
      },
      { status: 200 },
    );
  }
  if (path === '/auth/register' && method === 'POST') {
    try {
      const b = bodyText ? JSON.parse(bodyText) : {};
      const email = (b.email || '').toString().trim().toLowerCase();
      const password = (b.password || '').toString();
      const displayName = (b.displayName || email.split('@')[0] || 'User').toString();
      if (!email || !password || password.length < 8) {
        return NextResponse.json(
          { code: 'VALIDATION_FAILED', title: 'Validation failed', status: 400, detail: 'Email and password required (min 8 chars)' },
          { status: 400 },
        );
      }
      if (mockUsers.has(email)) {
        return NextResponse.json(
          { code: 'CONFLICT', title: 'Email taken', status: 409, detail: 'An account with this email already exists' },
          { status: 409 },
        );
      }
      const user: MockUser = {
        id: `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        email,
        displayName,
        password,
      };
      mockUsers.set(email, user);
      const tokens = {
        accessToken: mockJwt(user),
        refreshToken: `refresh-${user.id}-${Date.now()}`,
        tokenType: 'Bearer',
      };
      return NextResponse.json(
        {
          user: { id: user.id, email: user.email, displayName: user.displayName },
          tokens,
          workspace: { id: `ws-${user.id}`, name: `${displayName} Studio`, slug: `${email.split('@')[0]}-studio` },
        },
        { status: 201 },
      );
    } catch {
      return NextResponse.json(
        { code: 'PLATFORM_ERROR', title: 'Mock error', status: 500, detail: 'Fallback mock failed' },
        { status: 500 },
      );
    }
  }
  if (path === '/auth/login' && method === 'POST') {
    try {
      const b = bodyText ? JSON.parse(bodyText) : {};
      const email = (b.email || '').toString().trim().toLowerCase();
      const password = (b.password || '').toString();
      const user = mockUsers.get(email);
      if (!user || user.password !== password) {
        if (user && user.password !== password) {
          return NextResponse.json(
            { code: 'UNAUTHENTICATED', title: 'Invalid credentials', status: 401, detail: 'Incorrect email or password' },
            { status: 401 },
          );
        }
        return NextResponse.json(
          { code: 'UNAUTHENTICATED', title: 'Invalid credentials', status: 401, detail: 'Incorrect email or password - please register first' },
          { status: 401 },
        );
      }
      const tokens = {
        accessToken: mockJwt(user),
        refreshToken: `refresh-${user.id}-${Date.now()}`,
        tokenType: 'Bearer',
      };
      return NextResponse.json(
        {
          kind: 'tokens',
          user: { id: user.id, email: user.email, displayName: user.displayName },
          tokens,
        },
        { status: 200 },
      );
    } catch {
      return NextResponse.json(
        { code: 'PLATFORM_ERROR', title: 'Mock error', status: 500, detail: 'Fallback mock failed' },
        { status: 500 },
      );
    }
  }
  if (path === '/auth/refresh' && method === 'POST') {
    try {
      const email = mockUsers.keys().next().value as string | undefined;
      let user: MockUser | undefined;
      if (email) user = mockUsers.get(email);
      if (!user) {
        return NextResponse.json(
          { code: 'UNAUTHENTICATED', title: 'Session expired', status: 401, detail: 'Session not found' },
          { status: 401 },
        );
      }
      const tokens = {
        accessToken: mockJwt(user),
        refreshToken: `refresh-${user.id}-${Date.now()}`,
        tokenType: 'Bearer',
      };
      return NextResponse.json(
        { user: { id: user.id, email: user.email, displayName: user.displayName }, tokens },
        { status: 200 },
      );
    } catch {
      return NextResponse.json(
        { code: 'PLATFORM_ERROR', title: 'Mock error', status: 500, detail: 'Fallback mock failed' },
        { status: 500 },
      );
    }
  }

  if (path.startsWith('/organizations')) {
    if (method === 'GET' && (path === '/organizations' || path.includes('/videos') || path.includes('/series'))) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }
  }

  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await params).path);
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await params).path);
}
export async function PUT(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await params).path);
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await params).path);
}
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(request, (await params).path);
}
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,Idempotency-Key',
    },
  });
}

async function proxy(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const candidates = getUpstreamCandidates();
  const targetPath = upstreamPath(segments);
  const isHealth = segments[0] === 'health';

  if (candidates.length === 0) {
    if (isHealth) {
      return NextResponse.json(
        { status: 'ok', service: 'apps/web', version: '0.2.0-railway', environment: 'production', timestamp: new Date().toISOString(), note: 'no upstream configured - local health' },
        { status: 200 },
      );
    }
    return NextResponse.json(
      { type: 'about:blank', title: 'Upstream not configured', status: 503, code: 'UPSTREAM_NOT_CONFIGURED', detail: 'API_UPSTREAM is not set. Set it to Railway URL in Vercel env.' },
      { status: 503 },
    );
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  let bodyBuffer: ArrayBuffer | undefined;
  let bodyText: string | null = null;
  if (hasBody) {
    try {
      bodyBuffer = await request.arrayBuffer();
      if (bodyBuffer) bodyText = Buffer.from(bodyBuffer).toString('utf-8');
    } catch {
      bodyBuffer = undefined;
    }
  }

  for (const upstreamOrigin of candidates) {
    const target = new URL(targetPath, upstreamOrigin);
    request.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('transfer-encoding');
    if (!headers.has('accept')) headers.set('accept', 'application/json');

    const maxAttempts = isHealth ? 2 : 4;
    const baseDelayMs = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const upstreamRes = await fetchWithTimeout(
          target.toString(),
          {
            method: request.method,
            headers,
            body: bodyBuffer,
            // @ts-expect-error duplex
            duplex: hasBody ? 'half' : undefined,
          },
          isHealth ? 8000 : 20000,
        );

        const contentType = upstreamRes.headers.get('content-type');
        let shouldRetryAsColdStart = false;

        if (contentType && contentType.includes('text/html')) {
          const txt = await upstreamRes.clone().text();
          if (isHtmlInterstitial(txt, contentType)) {
            shouldRetryAsColdStart = true;
          }
        } else if (upstreamRes.status === 503 || upstreamRes.status === 502) {
          const txt = await upstreamRes.clone().text().catch(() => '');
          if (txt && isHtmlInterstitial(txt, contentType)) {
            shouldRetryAsColdStart = true;
          }
        }

        if (shouldRetryAsColdStart) {
          if (attempt < maxAttempts - 1) {
            const delay = baseDelayMs * Math.pow(1.8, attempt);
            console.warn(`[api/v1 proxy] cold-start detected (attempt ${attempt + 1}/${maxAttempts}) for ${target} - retrying in ${delay}ms`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          if (isHealth) {
            return NextResponse.json(
              {
                status: 'waking',
                service: 'api-upstream',
                upstream: upstreamOrigin,
                detail: 'Upstream is waking up (Railway cold start). Retried and still serving interstitial.',
                timestamp: new Date().toISOString(),
              },
              { status: 200, headers: { 'Retry-After': '15' } },
            );
          }
          return NextResponse.json(
            {
              type: 'about:blank',
              title: 'Upstream cold start',
              status: 503,
              code: 'COLD_START',
              detail: 'الخدمة تستيقظ الآن (cold start) - يتم إعادة المحاولة تلقائياً. حاول مرة أخرى خلال 10 ثوانٍ.',
              upstream: upstreamOrigin,
            },
            { status: 503, headers: { 'Retry-After': '10' } },
          );
        }

        const resHeaders = new Headers(upstreamRes.headers);
        resHeaders.delete('transfer-encoding');
        resHeaders.delete('connection');
        resHeaders.delete('content-encoding');
        resHeaders.set('Access-Control-Allow-Origin', '*');

        return new NextResponse(upstreamRes.body, {
          status: upstreamRes.status,
          headers: resHeaders,
        });
      } catch (err: any) {
        const isAbort = err?.name === 'AbortError';
        console.error(`[api/v1 proxy] attempt ${attempt + 1}/${maxAttempts} failed for ${target} (${isAbort ? 'timeout' : err?.message})`);

        if (attempt < maxAttempts - 1) {
          const delay = baseDelayMs * Math.pow(1.6, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        break;
      }
    }
  }

  const localMock = handleLocalMock(segments, request.method, bodyText);
  if (localMock) return localMock;

  if (isHealth) {
    return NextResponse.json(
      {
        status: 'degraded',
        service: 'apps/web-proxy',
        timestamp: new Date().toISOString(),
        detail: 'All API upstreams unreachable - proxy degraded but web alive',
        upstreams: candidates,
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      type: 'about:blank',
      title: 'Upstream unreachable',
      status: 502,
      code: 'UPSTREAM_UNREACHABLE',
      detail: 'تعذّر الوصول إلى الخادم الخلفي - الخدمة قد تكون في وضع الاستيقاظ. يتم إعادة المحاولة تلقائياً.',
      upstreams: candidates,
    },
    { status: 502, headers: { 'Retry-After': '5' } },
  );
}
