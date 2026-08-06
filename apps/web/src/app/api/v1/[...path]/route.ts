/**
 * Phase-1 catch-all API proxy: /api/v1/* → Render upstream.
 * Last rebuilt: 2026-08-05T20:25Z — force Vercel to pick up the new
 * vercel.json config (no outputDirectory, framework: nextjs) so the
 * .next/ build is published instead of the stale static export.
 *
 * Route mapping:
 *   /api/v1/auth/*    → UPSTREAM/v1/auth/*
 *   /api/v1/health/*  → UPSTREAM/health/*  (VERSION_NEUTRAL on the API)
 *   /api/v1/<other>   → UPSTREAM/v1/<other>
 *
 * The upstream origin is read from API_UPSTREAM (server-only env var) with a
 * fallback to the public NEXT_PUBLIC_API_BASE so that local dev works without
 * extra config.  The browser never sees the upstream URL — all traffic goes
 * through /api/v1/… on the same origin.
 *
 * Always-on: this same /health route is used by the keep-alive cron declared
 * in vercel.json so the upstream is pinged every 10 minutes and never idles
 * into a sleep (see report: cold-start elimination).
 */
import { NextRequest, NextResponse } from 'next/server';

const UPSTREAM =
  process.env.API_UPSTREAM?.replace(/\/+$/, '') ||
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, '') ||
  'https://autocreator-api-preview.onrender.com';

/**
 * Remap the public path to the upstream path.
 * Health endpoints live at VERSION_NEUTRAL (/health, /health/live, /health/ready)
 * so /api/v1/health/* → /health/* rather than /v1/health/*.
 */
function upstreamPath(segments: string[]): string {
  if (segments[0] === 'health') {
    // /api/v1/health/live → /health/live
    return '/' + segments.join('/');
  }
  // Everything else is versioned: /api/v1/auth/login → /v1/auth/login
  return '/v1/' + segments.join('/');
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

async function proxy(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const target = new URL(upstreamPath(segments), UPSTREAM);

  // Forward query string.
  request.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));

  // Clone headers, drop host / connection hop-by-hop.
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('transfer-encoding');

  // Body: forward for mutating methods, omit for GET/HEAD.
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const body = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body,
      // @ts-expect-error — duplex is required for streaming bodies in Node fetch
      duplex: hasBody ? 'half' : undefined,
    });

    // Build response headers; strip hop-by-hop from upstream too.
    const resHeaders = new Headers(upstream.headers);
    resHeaders.delete('transfer-encoding');
    resHeaders.delete('connection');
    resHeaders.delete('content-encoding'); // let Next.js handle encoding

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (err) {
    console.error('[api/v1 proxy]', err);
    return NextResponse.json(
      { type: 'about:blank', title: 'Upstream unreachable', status: 502, detail: 'The API upstream did not respond' },
      { status: 502 },
    );
  }
}
