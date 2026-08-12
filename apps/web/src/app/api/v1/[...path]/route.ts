/**
 * Catch-all API proxy: /api/v1/* → AWS API upstream (production).
 *
 * No Railway, no Render, no localhost fallback. The ONLY upstream is
 * API_UPSTREAM (set in Vercel env to the AWS ALB/API domain).
 * The browser never sees the upstream origin — server-side only.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const RAW_UPSTREAM = process.env.API_UPSTREAM?.trim() || process.env.NEXT_PUBLIC_API_BASE?.trim() || '';

function cleanOrigin(s: string): string {
  return s.replace(/\/+$/, '').trim();
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
    t.includes('your app is almost live')
  );
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal } as RequestInit);
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
  const upstream = RAW_UPSTREAM ? cleanOrigin(RAW_UPSTREAM) : '';
  const targetPath = upstreamPath(segments);
  const isHealth = segments[0] === 'health';

  if (!upstream) {
    return NextResponse.json(
      { type: 'about:blank', title: 'Upstream not configured', status: 503, code: 'UPSTREAM_NOT_CONFIGURED', detail: 'API_UPSTREAM is not set. Set it to the AWS API domain in Vercel env.' },
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

  const target = new URL(targetPath, upstream);
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
          cache: 'no-store',
        },
        isHealth ? 10_000 : 25_000,
      );

      const contentType = upstreamRes.headers.get('content-type') ?? '';
      const text = await upstreamRes.text();

      if (isHtmlInterstitial(text, contentType)) {
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
          continue;
        }
        return NextResponse.json(
          { type: 'about:blank', title: 'Upstream waking up', status: 503, code: 'COLD_START', detail: 'API is starting — retry in a few seconds' },
          { status: 503 },
        );
      }

      const responseHeaders = new Headers({
        'content-type': contentType,
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': 'Content-Type,Authorization,Idempotency-Key',
        'cache-control': 'no-store',
      });
      upstreamRes.headers.forEach((v, k) => {
        if (!['content-length', 'content-encoding', 'transfer-encoding'].includes(k.toLowerCase())) {
          responseHeaders.set(k, v);
        }
      });

      if (upstreamRes.status === 502 || upstreamRes.status === 503) {
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
          continue;
        }
      }

      return new NextResponse(text, { status: upstreamRes.status, headers: responseHeaders });
    } catch (err) {
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
        continue;
      }
      const msg = err instanceof Error ? err.message : 'upstream unreachable';
      return NextResponse.json(
        { type: 'about:blank', title: 'Upstream unreachable', status: 502, code: 'UPSTREAM_UNREACHABLE', detail: msg },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    { type: 'about:blank', title: 'Upstream unreachable', status: 502, code: 'UPSTREAM_UNREACHABLE', detail: 'all attempts failed' },
    { status: 502 },
  );
}
