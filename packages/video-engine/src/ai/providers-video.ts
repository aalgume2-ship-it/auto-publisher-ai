/**
 * AI moving-picture providers — REAL text/image→video backends (Roadmap:
 * "real cinematic motion, not Ken Burns stills"). All three speak async-task
 * protocol: submit → poll → download the resulting MP4.
 *   - Runway  Gen-3 Alpha Turbo  (dev.runwayml.com, X-Runway-Version pinned)
 *   - Luma    Dream Machine Ray  (lumalabs.ai dream-machine/v1)
 *   - Kling   v2.1 Master        (hosted via fal.ai queue)
 * A scene still (Pollinations URL) is passed as the FIRST FRAME so every clip
 * stays coherent with the rest of the cut; text-only is supported when no
 * still exists. No keyless video provider exists today (verified 2026-08-03),
 * so these resolve from the org vault (Settings) or env — fail-closed.
 */
export interface VideoProviderDef {
  id: 'runway' | 'luma' | 'fal-kling';
  label: string;
  model: string;
  consoleUrl: string;
  priceHint: string; // shown in Settings so tenants know cost BEFORE pasting
  envKey: string;
  supportsFirstFrame: boolean;
  supportedDurations: number[]; // seconds the API accepts
}

export const VIDEO_PROVIDERS: readonly VideoProviderDef[] = [
  {
    id: 'runway',
    label: 'Runway Gen-3 Alpha Turbo',
    model: 'gen3a_turbo',
    consoleUrl: 'https://dev.runwayml.com',
    priceHint: 'pay-as-you-go (~$0.25 / 5s clip)',
    envKey: 'RUNWAY_API_KEY',
    supportsFirstFrame: true,
    supportedDurations: [5, 10],
  },
  {
    id: 'luma',
    label: 'Luma Dream Machine (Ray)',
    model: 'ray-2',
    consoleUrl: 'https://lumalabs.ai/api',
    priceHint: 'pay-as-you-go (~$0.35 / 5s clip)',
    envKey: 'LUMA_API_KEY',
    supportsFirstFrame: true,
    supportedDurations: [5],
  },
  {
    id: 'fal-kling',
    label: 'Kling 2.1 Master (fal.ai)',
    model: 'fal-ai/kling-video/v2.1/master/image-to-video',
    consoleUrl: 'https://fal.ai/dashboard/keys',
    priceHint: 'pay-as-you-go (~$1.40 / 5s clip)',
    envKey: 'FAL_KEY',
    supportsFirstFrame: true,
    supportedDurations: [5, 10],
  },
] as const;

export const VIDEO_PROVIDER_MAP: ReadonlyMap<string, VideoProviderDef> = new Map(VIDEO_PROVIDERS.map((p) => [p.id, p]));

export interface VideoCredential {
  def: VideoProviderDef;
  apiKey: string;
  source: 'org' | 'env';
}

export interface ClipRequest {
  prompt: string;
  firstFrameUrl: string | null;
  /** narration window in seconds — provider picks nearest supported value */
  windowSec: number;
}

const POLL_INTERVAL_MS = 6_000;
const CLIP_TIMEOUT_MS = 8 * 60_000;

async function http(url: string, init: RequestInit, timeoutMs = 30_000): Promise<{ status: number; data: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

const bearer = (k: string) => ({ authorization: `Bearer ${k}`, 'content-type': 'application/json' });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------------- RUNWAY */

async function runwaySubmit(apiKey: string, req: ClipRequest): Promise<string> {
  const duration = req.windowSec > 7 ? 10 : 5;
  const body: Record<string, unknown> = {
    model: 'gen3a_turbo',
    promptText: `${req.prompt}, cinematic camera motion, vertical`,
    duration,
    ratio: '768:1280',
  };
  if (req.firstFrameUrl) {
    body['promptImage'] = [{ uri: req.firstFrameUrl, position: 'first' }];
  }
  const { status, data } = await http('https://api.dev.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers: { ...bearer(apiKey), 'x-runway-version': '2024-11-06' },
    body: JSON.stringify(body),
  });
  const d = (data ?? {}) as { id?: string; error?: string; message?: string };
  if ((status !== 200 && status !== 201) || !d.id) {
    throw new Error(`runway submit ${status}: ${(d.error ?? d.message ?? 'no task id').slice(0, 200)}`);
  }
  return d.id;
}

async function runwayPoll(apiKey: string, taskId: string): Promise<string> {
  const deadline = Date.now() + CLIP_TIMEOUT_MS;
  for (;;) {
    const { status, data } = await http(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      headers: { ...bearer(apiKey), 'x-runway-version': '2024-11-06' },
    });
    const d = (data ?? {}) as { status?: string; output?: string[]; failure?: string; failureCode?: string };
    if (d.status === 'SUCCEEDED' && d.output?.[0]) return d.output[0];
    if (d.status === 'FAILED' || d.status === 'CANCELLED') {
      throw new Error(`runway task failed: ${d.failure ?? d.failureCode ?? 'unknown'}`);
    }
    if (status === 401 || status === 403) throw new Error(`runway poll ${status}: key rejected mid-task`);
    if (Date.now() > deadline) throw new Error('runway task timed out after 8 min');
    await sleep(POLL_INTERVAL_MS);
  }
}

/* -------------------------------------------------------------------- LUMA */

async function lumaSubmit(apiKey: string, req: ClipRequest): Promise<string> {
  const body: Record<string, unknown> = {
    prompt: `${req.prompt}, slow cinematic camera movement`,
    aspect_ratio: '9:16',
    model: 'ray-2',
  };
  if (req.firstFrameUrl) body['keyframes'] = { frame0: { type: 'image', url: req.firstFrameUrl } };
  const { status, data } = await http('https://api.lumalabs.ai/dream-machine/v1/generations', {
    method: 'POST',
    headers: bearer(apiKey),
    body: JSON.stringify(body),
  });
  const d = (data ?? {}) as { id?: string; detail?: string };
  if ((status !== 200 && status !== 201) || !d.id) {
    throw new Error(`luma submit ${status}: ${(d.detail ?? 'no generation id').slice(0, 200)}`);
  }
  return d.id;
}

async function lumaPoll(apiKey: string, id: string): Promise<string> {
  const deadline = Date.now() + CLIP_TIMEOUT_MS;
  for (;;) {
    const { status, data } = await http(`https://api.lumalabs.ai/dream-machine/v1/generations/${id}`, { headers: bearer(apiKey) });
    const d = (data ?? {}) as { state?: string; assets?: { video?: string }; failure_reason?: string; detail?: string };
    if (d.state === 'completed' && d.assets?.video) return d.assets.video;
    if (d.state === 'failed') throw new Error(`luma generation failed: ${d.failure_reason ?? 'unknown'}`);
    if (status === 401 || status === 403) throw new Error(`luma poll ${status}: key rejected mid-task`);
    if (Date.now() > deadline) throw new Error('luma generation timed out after 8 min');
    await sleep(POLL_INTERVAL_MS);
  }
}

/* ---------------------------------------------------------------- FAL KLING */

async function falSubmit(apiKey: string, req: ClipRequest): Promise<{ statusUrl: string; responseUrl: string }> {
  const body: Record<string, unknown> = {
    prompt: `${req.prompt}, smooth cinematic motion`,
    duration: req.windowSec > 7 ? '10' : '5',
    aspect_ratio: '9:16',
    cfg_scale: 0.5,
  };
  if (req.firstFrameUrl) body['image_url'] = req.firstFrameUrl;
  const { status, data } = await http('https://queue.fal.run/fal-ai/kling-video/v2.1/master/image-to-video', {
    method: 'POST',
    headers: { authorization: `Key ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = (data ?? {}) as { status_url?: string; response_url?: string; detail?: string };
  if ((status !== 200 && status !== 202) || !d.status_url || !d.response_url) {
    throw new Error(`fal submit ${status}: ${(typeof d.detail === 'string' ? d.detail : 'no queue urls').slice(0, 200)}`);
  }
  return { statusUrl: d.status_url, responseUrl: d.response_url };
}

async function falPoll(apiKey: string, urls: { statusUrl: string; responseUrl: string }): Promise<string> {
  const deadline = Date.now() + CLIP_TIMEOUT_MS;
  for (;;) {
    const { status, data: st } = await http(urls.statusUrl, { headers: { authorization: `Key ${apiKey}` } });
    const s = (st ?? {}) as { status?: string; error?: string };
    if (s.status === 'COMPLETED') {
      const { data: out } = await http(urls.responseUrl, { headers: { authorization: `Key ${apiKey}` } });
      const o = (out ?? {}) as { video?: { url?: string } };
      if (o.video?.url) return o.video.url;
      throw new Error('fal completed without a video url');
    }
    if (s.status === 'FAILED') throw new Error(`fal task failed: ${s.error ?? 'unknown'}`);
    if (status === 401 || status === 403) throw new Error('fal poll 401/403: key rejected mid-task');
    if (Date.now() > deadline) throw new Error('fal task timed out after 8 min');
    await sleep(POLL_INTERVAL_MS);
  }
}

/* ------------------------------------------------------------------ facade */

/** Submit + poll + download a moving clip. Returns raw MP4 bytes. */
export async function generateClip(cred: VideoCredential, req: ClipRequest): Promise<Buffer> {
  let videoUrl: string;
  if (cred.def.id === 'runway') {
    videoUrl = await runwayPoll(cred.apiKey, await runwaySubmit(cred.apiKey, req));
  } else if (cred.def.id === 'luma') {
    videoUrl = await lumaPoll(cred.apiKey, await lumaSubmit(cred.apiKey, req));
  } else {
    videoUrl = await falPoll(cred.apiKey, await falSubmit(cred.apiKey, req));
  }
  const res = await fetch(videoUrl, { headers: { 'user-agent': 'autocreator-pipeline/1.0' } });
  if (!res.ok) throw new Error(`${cred.def.id} cdn ${res.status}: clip download failed`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 30_000) throw new Error(`${cred.def.id} returned a suspiciously small clip`);
  return buf;
}

/**
 * REAL key validation: query a deliberately-bogus task id. Providers answer
 * 401/403 for a bad key and 404 (or "not found") for a good one — so a valid
 * key is proven without spending a single generation credit.
 */
export async function validateVideoKey(def: VideoProviderDef, apiKey: string): Promise<void> {
  const bogus = '00000000-0000-4000-8000-000000000000';
  let status: number;
  if (def.id === 'runway') {
    ({ status } = await http(`https://api.dev.runwayml.com/v1/tasks/${bogus}`, {
      headers: { ...bearer(apiKey), 'x-runway-version': '2024-11-06' },
    }));
  } else if (def.id === 'luma') {
    ({ status } = await http(`https://api.lumalabs.ai/dream-machine/v1/generations/${bogus}`, { headers: bearer(apiKey) }));
  } else {
    ({ status } = await http(`https://queue.fal.run/${def.model}/requests/${bogus}/status`, {
      headers: { authorization: `Key ${apiKey}` },
    }));
  }
  if (status === 401 || status === 403) throw new Error(`key rejected by ${def.label}: HTTP ${status}`);
  if (status === 429) return; // rate-limited but authenticated — the key is real
  if (status >= 500) throw new Error(`${def.label} validation endpoint unreachable (HTTP ${status})`);
  // 200/404/422 ⇒ authenticated, id simply doesn't exist — key accepted.
}
