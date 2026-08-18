/**
 * Narrow server-side egress bridge for the public LTX-2.3 ZeroGPU Space.
 *
 * AWS datacenter egress is intermittently rejected by the shared GPU queue,
 * while Vercel egress is accepted. This route intentionally exposes only the
 * three calls required by LTX generation and validates their shape.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LTX_ORIGIN = 'https://lightricks-ltx-2-3.hf.space';
const PROXY_MARKER = 'ltx-v1';

function denied(detail: string, status = 400) {
  return NextResponse.json({ error: 'invalid LTX proxy request', detail }, { status });
}

function proxyHeaders(upstream: Response): Headers {
  const headers = new Headers({
    'cache-control': 'no-store',
    'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
  });
  const length = upstream.headers.get('content-length');
  if (length) headers.set('content-length', length);
  return headers;
}

async function forward(url: string, init?: RequestInit): Promise<Response> {
  const upstream = await fetch(url, { ...init, cache: 'no-store' });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: proxyHeaders(upstream),
  });
}

function authorized(request: NextRequest): boolean {
  return request.headers.get('x-lumen-video-proxy') === PROXY_MARKER;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!authorized(request)) return denied('missing proxy marker', 403);
  const path = (await params).path;
  if (path.length !== 1 || path[0] !== 'generate_video') return denied('unsupported operation', 404);

  const raw = await request.text();
  if (raw.length > 4_096) return denied('payload too large', 413);
  let parsed: { data?: unknown[] };
  try {
    parsed = JSON.parse(raw) as { data?: unknown[] };
  } catch {
    return denied('invalid JSON');
  }
  const data = parsed.data;
  if (!Array.isArray(data) || data.length !== 8) return denied('invalid Gradio payload');
  const prompt = data[1];
  const duration = data[2];
  if (typeof prompt !== 'string' || prompt.length < 3 || prompt.length > 500) return denied('invalid prompt');
  if (typeof duration !== 'number' || duration < 1 || duration > 5) return denied('invalid duration');
  if (data[6] !== 768 || data[7] !== 512) return denied('invalid dimensions');

  return forward(`${LTX_ORIGIN}/gradio_api/call/generate_video`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: raw,
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!authorized(request)) return denied('missing proxy marker', 403);
  const path = (await params).path;

  if (path.length === 2 && path[0] === 'generate_video' && /^[A-Za-z0-9_-]{6,160}$/.test(path[1] || '')) {
    return forward(`${LTX_ORIGIN}/gradio_api/call/generate_video/${path[1]}`, {
      headers: { accept: 'text/event-stream' },
    });
  }

  if (path.length === 1 && path[0] === 'file') {
    const value = request.nextUrl.searchParams.get('url');
    if (!value) return denied('missing file URL');
    let target: URL;
    try {
      target = new URL(value);
    } catch {
      return denied('invalid file URL');
    }
    if (target.origin !== LTX_ORIGIN || !target.pathname.startsWith('/gradio_api/file=')) {
      return denied('file URL is outside LTX');
    }
    return forward(target.toString(), { headers: { accept: 'video/mp4' } });
  }

  return denied('unsupported operation', 404);
}
