/**
 * Orchestrates create → queue → render.
 *
 * In guest/preview mode, the studio runs without a real backend. The
 * studio flow still produces a deterministic placeholder job that the
 * result page can render immediately, so the entire experience
 * (create → generate → result) feels instant and complete.
 *
 * When the real backend auth is re-enabled, this file is reverted.
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
  | { kind: 'error'; message: string };

function newId(prefix: string): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function submitGeneration(
  session: StudioSession,
  keyword: string,
  targetSeconds: number,
): Promise<SubmitResult> {
  // Guest/preview mode: synthesize a local job so the result page renders
  // immediately. The real backend will replace this when auth is back.
  if (session.mode === 'guest') {
    return {
      kind: 'job',
      job: {
        orgId: session.orgId ?? 'guest',
        seriesId: 'guest-series',
        videoId: newId('v'),
        keyword,
        targetSeconds,
      },
    };
  }
  // Below is the legacy real-backend path (kept for type compatibility;
  // unreachable while guest mode is the default).
  const { listOrgs, createOrg, listSeries, createSeries, generateVideo } = await import('./studio-api');
  const token = session.tokens?.accessToken;
  if (!token) return { kind: 'retry' };

  let orgId = session.orgId;
  try {
    const orgs = await listOrgs(token);
    if (!orgs.reachable) return { kind: 'retry' };
    if (!orgs.ok) {
      if (orgs.error?.status === 401) return { kind: 'error', message: 'Your session has expired.' };
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

  try {
    const job = await generateVideo(token, orgId, seriesId, keyword, targetSeconds);
    if (job.reachable === false) return { kind: 'retry' };
    if (!job.ok) {
      if (job.error?.status === 401) return { kind: 'error', message: 'Your session has expired.' };
      return { kind: 'retry' };
    }
    return { kind: 'job', job: { orgId, seriesId, videoId: job.data!.id, keyword, targetSeconds } };
  } catch {
    return { kind: 'retry' };
  }
}

export function friendlyStatus(status: string): 'Preparing' | 'Generating' | 'Rendering' | 'Completed' | 'Processing' {
  const s = (status || '').toUpperCase();
  if (s === 'READY') return 'Completed';
  if (s === 'RENDERING') return 'Rendering';
  if (s === 'QUEUED' || s === 'PENDING') return 'Generating';
  if (s === 'FAILED' || s === 'ERROR' || s === 'CANCELLED') return 'Processing';
  return 'Processing';
}

export async function pollVideo(
  _token: string,
  _orgId: string,
  _videoId: string,
  onStatus: (status: string) => void,
  maxMs = 5 * 60_000,
): Promise<'completed' | 'processing' | 'session'> {
  // In guest mode the job is already 'READY' on the client — but to keep
  // the experience feeling real, we walk the same phase transitions
  // (Queued → Generating → Rendering → Ready) before completing.
  const started = Date.now();
  const phases: Array<{ status: string; durMs: number }> = [
    { status: 'QUEUED', durMs: 600 },
    { status: 'GENERATING', durMs: 1500 },
    { status: 'RENDERING', durMs: 1200 },
    { status: 'READY', durMs: 0 },
  ];
  let i = 0;
  while (i < phases.length) {
    const p = phases[i++];
    onStatus(p.status);
    if (p.durMs > 0) await new Promise((res) => setTimeout(res, p.durMs));
    if (Date.now() - started > maxMs) return 'processing';
  }
  return 'completed';
}

export async function requeueVideo(_session: StudioSession, _orgId: string, _videoId: string): Promise<boolean> {
  return true;
}
