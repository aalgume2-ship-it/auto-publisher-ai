/**
 * Catch-all API proxy: /api/v1/* → AWS API upstream (production).
 *
 * The production recovery ALB is the verified source of truth. We deliberately
 * prefer it over Vercel environment variables because a stale API_UPSTREAM can
 * otherwise route the live Lumen UI to a deleted deployment and return 502s.
 *
 * IMPORTANT: media responses are proxied as raw bytes. Converting an MP4 to
 * text corrupts the container and leaves the browser video element at 0:00.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const VERIFIED_PRODUCTION_UPSTREAM = 'http://autocreator-recovery-alb-979440653.eu-north-1.elb.amazonaws.com';
const RAW_UPSTREAM = VERIFIED_PRODUCTION_UPSTREAM;

function cleanOrigin(s: string): string {
  return s.replace(/\/+$/, '').trim();
}

function upstreamPath(segments: string[]): string {
  if (segments[0] === 'health') {
    return '/' + segments.join('/');
  }
  return '/v1/' + segments.join('/');
}

function isTextualContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct.includes('application/json') ||
    ct.includes('application/problem+json') ||
    ct.startsWith('text/') ||
    ct.includes('application/xml') ||
    ct.includes('application/javascript')
  );
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
export async function HEAD(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
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
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,Idempotency-Key,Range',
      'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
    },
  });
}

async function proxy(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const upstream = cleanOrigin(RAW_UPSTREAM);
  const targetPath = upstreamPath(segments);
  const isHealth = segments[0] === 'health';
  const base64Binary = request.headers.get('x-lumen-binary-as-base64') === '1';

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
      const isTextual = isTextualContentType(contentType);
      const binaryBytes = !isTextual && request.method !== 'HEAD' && base64Binary
        ? new Uint8Array(await upstreamRes.arrayBuffer())
        : null;
      const payload = request.method === 'HEAD'
        ? null
        : isTextual
          ? await upstreamRes.text()
          : binaryBytes
            ? JSON.stringify({
                base64: Buffer.from(binaryBytes).toString('base64'),
                contentRange: upstreamRes.headers.get('content-range'),
                contentLength: binaryBytes.byteLength,
              })
          // Preserve media byte-for-byte. Buffering the upstream MP4 through
          // the route runtime can coerce arbitrary bytes through UTF-8 and
          // introduce replacement characters, corrupting the container.
            : upstreamRes.body;

      if (isTextual && typeof payload === 'string' && isHtmlInterstitial(payload, contentType)) {
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
        'access-control-allow-methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': 'Content-Type,Authorization,Idempotency-Key,Range',
        'access-control-expose-headers': 'Content-Length,Content-Range,Accept-Ranges',
        'cache-control': 'no-store',
      });
      upstreamRes.headers.forEach((v, k) => {
        if (!['content-encoding', 'transfer-encoding'].includes(k.toLowerCase())) {
          responseHeaders.set(k, v);
        }
      });
      if (binaryBytes) {
        responseHeaders.set('content-type', 'application/json; charset=utf-8');
        responseHeaders.delete('content-length');
      }

      if (upstreamRes.status === 502 || upstreamRes.status === 503) {
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
          continue;
        }
      }

      return new NextResponse(payload, { status: upstreamRes.status, headers: responseHeaders });
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
