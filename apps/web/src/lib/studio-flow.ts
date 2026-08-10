/**
 * Video generation flow — talks to the real backend only.
 *
 * Pipeline (every step is a real API call to /api/v1/*):
 *   submitGeneration
 *     → POST /v1/organizations/:orgId/series/:seriesId/videos
 *       (real Runway / Luma / fal.ai job is enqueued on the server)
 *   pollVideo
 *     → GET /v1/organizations/:orgId/videos/:videoId (real provider status)
 *   requeueVideo
 *     → POST /v1/organizations/:orgId/videos/:videoId/regenerate
 *
 * If the backend is not configured, every call returns a typed
 * `not_configured` result. The UI surfaces this as a banner — the
 * job is NEVER marked "completed" with a fake video.
 */
import type { StudioSession } from './studio-session';

export interface SubmittedJob {
  orgId: string;
  seriesId: string;
  videoId: string;
  keyword: string;
  targetSeconds: number;
}

export type SubmitResult =
  | { kind: 'job'; job: SubmittedJob }
  | { kind: 'retry' }
  | { kind: 'error'; message: string }
  | { kind: 'not_configured'; detail: string };

export type PollResult =
  | { kind: 'status'; status: string }
  | { kind: 'not_configured'; detail: string }
  | { kind: 'error'; message: string };

const POLL_INTERVAL_MS = 3000;

function getToken(session: StudioSession): string | null {
  if (session.mode === 'guest') return null;
  return session.tokens?.accessToken ?? null;
}

export async function submitGeneration(
  session: StudioSession,
  keyword: string,
  targetSeconds: number,
): Promise<SubmitResult> {
  const token = getToken(session);
  if (!token) {
    return {
      kind: 'not_configured',
      detail: 'Sign in and configure at least one video provider (Runway, Luma, fal.ai, Replicate) to generate real videos.',
    };
  }

  let orgId = session.orgId;
  if (!orgId) {
    return { kind: 'not_configured', detail: 'No organization is linked to this session.' };
  }

  try {
    const api = await import('./studio-api');
    // 1) Find or create a series.
    const series = await api.listSeries(token, orgId);
    if (!series.reachable) return { kind: 'not_configured', detail: 'API is unreachable. Check API_UPSTREAM.' };
    if (series.error?.status === 401) return { kind: 'error', message: 'Your session has expired.' };
    if (!series.ok && !series.reachable) return { kind: 'retry' };

    let seriesId = series.data?.items?.[0]?.id;
    if (!seriesId) {
      const created = await api.createSeries(token, orgId, 'Studio Clips');
      if (!created.ok) return { kind: 'error', message: created.error?.detail ?? 'Failed to create a series.' };
      seriesId = created.data!.id;
    }

    // 2) Submit the real generation job.
    const job = await api.generateVideo(token, orgId, seriesId, keyword, targetSeconds);
    if (job.reachable === false) return { kind: 'not_configured', detail: 'API is unreachable.' };
    if (!job.ok) {
      if (job.error?.status === 401) return { kind: 'error', message: 'Your session has expired.' };
      if (job.error?.code === 'PROVIDER_NOT_CONFIGURED') {
        return {
          kind: 'not_configured',
          detail: job.error.detail ?? 'No video provider is configured on the server. Set RUNWAY_API_KEY, LUMA_API_KEY, FAL_API_KEY, or REPLICATE_API_TOKEN.',
        };
      }
      return { kind: 'error', message: job.error?.detail ?? 'Failed to submit the video job.' };
    }
    return { kind: 'job', job: { orgId, seriesId, videoId: job.data!.id, keyword, targetSeconds } };
  } catch (err) {
    return { kind: 'error', message: (err as Error).message ?? 'Unexpected error.' };
  }
}

export function friendlyStatus(status: string): 'Preparing' | 'Generating' | 'Rendering' | 'Completed' | 'Processing' {
  const s = (status || '').toUpperCase();
  if (s === 'READY' || s === 'COMPLETED' || s === 'DONE') return 'Completed';
  if (s === 'RENDERING' || s === 'ENCODING' || s === 'UPLOADING') return 'Rendering';
  if (s === 'QUEUED' || s === 'PENDING' || s === 'PREPARING') return 'Preparing';
  if (s === 'GENERATING' || s === 'PROCESSING') return 'Generating';
  if (s === 'FAILED' || s === 'ERROR' || s === 'CANCELLED') return 'Processing';
  return 'Processing';
}

/**
 * Poll the real backend for video status. Calls the API at fixed
 * intervals; the caller decides what to do with the result.
 */
export async function pollVideo(
  session: StudioSession,
  orgId: string,
  videoId: string,
  onStatus: (status: string) => void,
  opts: { intervalMs?: number; maxMs?: number; signal?: AbortSignal } = {},
): Promise<'completed' | 'failed' | 'processing' | 'session' | 'not_configured'> {
  const token = getToken(session);
  if (!token) {
    onStatus('NOT_CONFIGURED');
    return 'not_configured';
  }

  const interval = opts.intervalMs ?? POLL_INTERVAL_MS;
  const max = opts.maxMs ?? 5 * 60_000;
  const started = Date.now();
  const api = await import('./studio-api');

  while (Date.now() - started < max) {
    if (opts.signal?.aborted) return 'processing';
    const r = await api.getVideo(token, orgId, videoId);
    if (r.reachable === false) {
      onStatus('RETRY');
      await new Promise((res) => setTimeout(res, interval));
      continue;
    }
    if (!r.ok) {
      if (r.error?.status === 401) return 'session';
      onStatus('RETRY');
      await new Promise((res) => setTimeout(res, interval));
      continue;
    }
    const st = r.data?.status ?? 'QUEUED';
    onStatus(st);
    if (st === 'READY' || st === 'COMPLETED' || st === 'DONE') return 'completed';
    if (st === 'FAILED' || st === 'ERROR' || st === 'CANCELLED') return 'failed';
    await new Promise((res) => setTimeout(res, interval));
  }
  return 'processing';
}

export async function requeueVideo(
  session: StudioSession,
  orgId: string,
  videoId: string,
): Promise<{ ok: boolean; detail?: string }> {
  const token = getToken(session);
  if (!token) return { ok: false, detail: 'No active session.' };
  try {
    const api = await import('./studio-api');
    const r = await api.regenerateVideo(token, orgId, videoId);
    if (!r.ok) return { ok: false, detail: r.error?.detail ?? 'Re-queue failed.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}
