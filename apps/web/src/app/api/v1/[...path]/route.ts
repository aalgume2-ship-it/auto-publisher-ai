/**
 * Catch-all API proxy: /api/v1/* → Railway API upstream.
 *
 * No Render fallback - Railway only per migration.
 * This file MUST point to Railway after migration.
 */

import { NextRequest, NextResponse } from 'next/server';

const RAW_UPSTREAM =
  process.env.API_UPSTREAM?.trim() ||
  process.env.NEXT_PUBLIC_API_BASE?.trim() ||
  process.env.RAILWAY_PUBLIC_DOMAIN?.trim() ||
  '';

 // Railway-only fallback - NO RENDER
 // Real Railway URL MUST be set as API_UPSTREAM in Vercel env vars
const FALLBACK_UPSTREAMS = [
  process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN.replace(/^https?:\/\//, '')}` : '',
  'https://auto-publisher-ai-production.up.railway.app',
  'https://autocreator-api-production.up.railway.app',
  'https://auto-publisher-ai.up.railway.app',
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
    t.includes('allocating compute resources') ||
    t.includes('service waking up') ||
    t.includes('your app is almost live') ||
    t.includes('train has not arrived')
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
        { status: 'ok', service: 'apps/web', version: '0.3.0-railway-only', environment: 'production', timestamp: new Date().toISOString(), note: 'no upstream configured - set API_UPSTREAM to Railway URL' },
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
  if (hasBody) {
    try {
      bodyBuffer = await request.arrayBuffer();
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

    const maxAttempts = isHealth ? 2 : 3;
    const baseDelayMs = 1500;

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
          isHealth ? 8000 : 15000,
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
                detail: 'Upstream is waking up (Railway cold start).',
                timestamp: new Date().toISOString(),
              },
              { status: 200, headers: { 'Retry-After': '10' } },
            );
          }
          return NextResponse.json(
            {
              type: 'about:blank',
              title: 'Upstream cold start',
              status: 503,
              code: 'COLD_START',
              detail: 'الخدمة تستيقظ الآن - يتم إعادة المحاولة تلقائياً.',
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

  if (isHealth) {
    return NextResponse.json(
      {
        status: 'degraded',
        service: 'apps/web-proxy',
        timestamp: new Date().toISOString(),
        detail: 'All Railway upstreams unreachable - check API_UPSTREAM env and Railway deployment',
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
      detail: 'تعذّر الوصول إلى Railway - تأكد أن الخدمة تعمل وأن API_UPSTREAM صحيح.',
      upstreams: candidates,
    },
    { status: 502, headers: { 'Retry-After': '5' } },
  );
}
