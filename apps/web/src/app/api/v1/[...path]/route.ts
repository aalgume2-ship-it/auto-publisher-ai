/**
 * Catch-all API proxy: /api/v1/* → AWS-hosted API upstream.
 *
 * The AutoCreator AI backend (apps/api, NestJS) is deployed to AWS
 * (ECS/Fargate, EC2, or App Runner). Vercel hosts only the web app and
 * this serverless proxy; the browser never talks to AWS directly.
 *
 * Configuration:
 *   API_UPSTREAM              Required. e.g. https://api.aca.example.com
 *   ACA_INTERNAL_API_TOKEN    Optional. Bearer token forwarded as
 *                             `X-Internal-Token` for service-to-service
 *                             auth in production.
 *
 * No localhost fallback, no Render fallback, no Railway fallback. The
 * serverless proxy is intentionally minimal — every other concern
 * (retry, rate limit, observability) lives in the AWS API.
 */

import { NextRequest, NextResponse } from 'next/server';

const RAW_UPSTREAM = process.env.API_UPSTREAM?.trim() || '';

function cleanOrigin(s: string): string {
  return s.replace(/\/+$/, '').trim();
}

function getUpstreamOrigin(): string {
  return RAW_UPSTREAM ? cleanOrigin(RAW_UPSTREAM) : '';
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
    t.includes('service waking up')
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
  const upstreamOrigin = getUpstreamOrigin();
  const targetPath = upstreamPath(segments);
  const isHealth = segments[0] === 'health';

  if (!upstreamOrigin) {
    if (isHealth) {
      return NextResponse.json(
        {
          status: 'ok',
          service: 'apps/web-proxy',
          upstream: null,
          detail: 'API_UPSTREAM not configured. Set it in Vercel env to your AWS API URL (e.g. https://api.aca.example.com).',
          timestamp: new Date().toISOString(),
        },
        { status: 200 },
      );
    }
    return NextResponse.json(
      {
        type: 'about:blank',
        title: 'Upstream not configured',
        status: 503,
        code: 'UPSTREAM_NOT_CONFIGURED',
        detail: 'API_UPSTREAM is not set. Configure the AWS API URL in Vercel env.',
      },
      { status: 503 },
    );
  }

  const target = new URL(targetPath, upstreamOrigin);
  request.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('transfer-encoding');
  if (!headers.has('accept')) headers.set('accept', 'application/json');

  // Optional service-to-service auth header for production deployments.
  if (process.env.ACA_INTERNAL_API_TOKEN) {
    headers.set('X-Internal-Token', process.env.ACA_INTERNAL_API_TOKEN);
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

  const maxAttempts = isHealth ? 1 : 2;
  const baseDelayMs = 1000;

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
        isHealth ? 5000 : 20000,
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

      if (shouldRetryAsColdStart && attempt < maxAttempts - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
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
    } catch (err) {
      const e = err as { name?: string; message?: string };
      const isAbort = e?.name === 'AbortError';
      console.error(`[api/v1 proxy] attempt ${attempt + 1}/${maxAttempts} failed for ${target} (${isAbort ? 'timeout' : e?.message})`);
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      break;
    }
  }

  if (isHealth) {
    return NextResponse.json(
      {
        status: 'degraded',
        service: 'apps/web-proxy',
        upstream: upstreamOrigin,
        detail: 'AWS API upstream unreachable. Verify the service is running and API_UPSTREAM is correct.',
        timestamp: new Date().toISOString(),
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
      detail: 'تعذّر الوصول إلى الخدمة - تأكد أن API_UPSTREAM يشير إلى AWS API الصحيح.',
      upstream: upstreamOrigin,
    },
    { status: 502, headers: { 'Retry-After': '5' } },
  );
}
