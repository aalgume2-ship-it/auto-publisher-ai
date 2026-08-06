/**
 * Orchestrates create → queue → render against the real backend only.
 *
 * Provider failures (Runway/Luma/Replicate/OpenAI) surface as a friendly
 * "Processing…" state: the UI keeps polling and auto-re-enqueues the job,
 * and never shows technical messages like "API Unreachable" / "Cold Start".
 */
import type { StudioSession } from './studio-session';
import { listOrgs, createOrg, createSeries, generateVideo, getVideo, regenerateVideo } from './studio-api';

export interface SubmittedJob {
  orgId: string;
  seriesId: string;
  videoId: string;
  keyword: string;
  targetSeconds: number;
}
export type SubmitResult =
  | { kind: 'job'; job: SubmittedJob }
  | { kind: 'retry' }         // transient/network — show Processing, retry later
  | { kind: 'error'; message: string };

export async function submitGeneration(session: StudioSession, keyword: string, targetSeconds: number): Promise<SubmitResult> {
  const token = session.tokens?.accessToken;
  if (!token || session.mode !== 'api') return { kind: 'retry' };

  // 1. Ensure an org exists.
  let orgId = session.orgId;
  try {
    const orgs = await listOrgs(token);
    if (!orgs.reachable) return { kind: 'retry' };
    if (!orgs.ok) {
      if (orgs.error?.status === 401) return { kind: 'error', message: 'Your session has expired. Please sign in again.' };
      return { kind: 'retry' };
    }
    if (!orgId) {
      const existing = orgs.data?.items?.[0]?.organization;
      if (existing) orgId = existing.id;
    }
    if (!orgId) {
      const created = await createOrg(token, 'My Studio');
      if (!created.ok) return { kind: 'retry' };
      orgId = created.data!.id;
    }
  } catch {
    return { kind: 'retry' };
  }

  // 2. Ensure a series exists (reuse first, else create).
  let seriesId: string | undefined;
  try {
    const series = await listSeries(token, orgId);
    if (series.reachable === false) return { kind: 'retry' };
    if (series.ok) seriesId = series.data?.items?.[0]?.id;
    if (!seriesId) {
      const created = await createSeries(token, orgId, 'Studio Clips');
      if (!created.ok) return { kind: 'retry' };
      seriesId = created.data!.id;
    }
  } catch {
    return { kind: 'retry' };
  }

  // 3. Enqueue the real generation job.
  try {
    const job = await generateVideo(token, orgId, seriesId, keyword, targetSeconds);
    if (job.reachable === false) return { kind: 'retry' };
    if (!job.ok) {
      if (job.error?.status === 401) return { kind: 'error', message: 'Your session has expired. Please sign in again.' };
      return { kind: 'retry' };
    }
    return { kind: 'job', job: { orgId, seriesId, videoId: job.data!.id, keyword, targetSeconds } };
  } catch {
    return { kind: 'retry' };
  }
}

async function listSeries(token: string, orgId: string) {
  const { listSeries } = await import('./studio-api');
  return listSeries(token, orgId);
}

/** Map backend job status to the friendly user-facing state. */
export function friendlyStatus(status: string): 'Preparing' | 'Generating' | 'Rendering' | 'Completed' | 'Processing' {
  const s = (status || '').toUpperCase();
  if (s === 'READY') return 'Completed';
  if (s === 'RENDERING') return 'Rendering';
  if (s === 'QUEUED' || s === 'PENDING') return 'Generating';
  if (s === 'FAILED' || s === 'ERROR' || s === 'CANCELLED') return 'Processing';
  return 'Processing';
}

/**
 * Poll a job until READY. Returns the friendly outcome.
 *  - 'completed'  → READY
 *  - 'processing' → keep going (auto-retry); caller should wait and re-poll or re-enqueue
 *  - 'session'    → hard stop, needs re-auth
 */
export async function pollVideo(
  token: string,
  orgId: string,
  videoId: string,
  onStatus: (status: string) => void,
  maxMs = 5 * 60_000,
): Promise<'completed' | 'processing' | 'session'> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const r = await getVideo(token, orgId, videoId);
    if (r.reachable === false) return 'processing';
    if (!r.ok) {
      if (r.error?.status === 401) return 'session';
      return 'processing';
    }
    const st = r.data?.status ?? 'QUEUED';
    onStatus(st);
    if (st === 'READY') return 'completed';
    // Failed / transient — signal the caller to auto-retry (re-enqueue).
    if (['FAILED', 'ERROR', 'CANCELLED'].includes(st)) return 'processing';
    await new Promise((res) => setTimeout(res, 3000));
  }
  return 'processing';
}

/** Re-enqueue an existing video after a provider failure (auto-retry). */
export async function requeueVideo(session: StudioSession, orgId: string, videoId: string): Promise<boolean> {
  const token = session.tokens?.accessToken;
  if (!token || session.mode !== 'api') return false;
  const r = await regenerateVideo(token, orgId, videoId);
  return r.reachable !== false && r.ok;
}
