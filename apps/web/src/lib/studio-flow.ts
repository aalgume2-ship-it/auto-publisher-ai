/** Real create → queue → render orchestration. */
import type { StudioSession } from './studio-session';
import { listOrgs, createOrg, createSeries, generateVideo, getVideo, regenerateVideo } from './studio-api';

export interface SubmittedJob { orgId: string; seriesId: string; videoId: string; keyword: string; targetSeconds: number; }
export type SubmitResult =
  | { kind: 'job'; job: SubmittedJob }
  | { kind: 'retry' }
  | { kind: 'error'; message: string };

export async function submitGeneration(session: StudioSession, keyword: string, targetSeconds: number): Promise<SubmitResult> {
  const token = session.tokens?.accessToken;
  if (!token || session.mode !== 'api') return { kind: 'retry' };

  let orgId = session.orgId;
  try {
    const orgs = await listOrgs(token);
    if (!orgs.reachable) return { kind: 'retry' };
    if (!orgs.ok) {
      if (orgs.error?.status === 401) return { kind: 'error', message: 'Your session has expired. Please refresh the page.' };
      if ((orgs.error?.status ?? 0) >= 400 && (orgs.error?.status ?? 0) < 500) return { kind: 'error', message: orgs.error?.detail || 'Unable to access the workspace.' };
      return { kind: 'retry' };
    }
    if (!orgId) orgId = orgs.data?.items?.[0]?.organization?.id;
    if (!orgId) {
      const created = await createOrg(token, 'My Studio');
      if (!created.ok) {
        if ((created.error?.status ?? 0) >= 400 && (created.error?.status ?? 0) < 500) return { kind: 'error', message: created.error?.detail || 'Unable to create the workspace.' };
        return { kind: 'retry' };
      }
      orgId = created.data!.id;
    }
  } catch { return { kind: 'retry' }; }

  let seriesId: string | undefined;
  try {
    const series = await listSeries(token, orgId);
    if (series.reachable === false) return { kind: 'retry' };
    if (series.ok) seriesId = series.data?.items?.[0]?.id;
    if (!seriesId) {
      const created = await createSeries(token, orgId, 'Studio Clips');
      if (!created.ok) {
        if ((created.error?.status ?? 0) >= 400 && (created.error?.status ?? 0) < 500) return { kind: 'error', message: created.error?.detail || 'Unable to create the project.' };
        return { kind: 'retry' };
      }
      seriesId = created.data!.id;
    }
  } catch { return { kind: 'retry' }; }

  try {
    const safeSeconds = Math.min(60, Math.max(20, Math.round(targetSeconds)));
    const job = await generateVideo(token, orgId, seriesId, keyword, safeSeconds);
    if (job.reachable === false) return { kind: 'retry' };
    if (!job.ok) {
      if (job.error?.status === 401) return { kind: 'error', message: 'Your session has expired. Please refresh the page.' };
      if ((job.error?.status ?? 0) >= 400 && (job.error?.status ?? 0) < 500) return { kind: 'error', message: job.error?.detail || 'The generation request was rejected by the API.' };
      return { kind: 'retry' };
    }
    const data: any = job.data;
    const videoId = data?.video?.id ?? data?.id;
    if (!videoId) return { kind: 'error', message: 'The API accepted the request but did not return a video ID.' };
    return { kind: 'job', job: { orgId, seriesId, videoId, keyword, targetSeconds: safeSeconds } };
  } catch { return { kind: 'retry' }; }
}

async function listSeries(token: string, orgId: string) {
  const { listSeries } = await import('./studio-api');
  return listSeries(token, orgId);
}

export function friendlyStatus(status: string): 'Preparing' | 'Generating' | 'Rendering' | 'Completed' | 'Processing' {
  const s = (status || '').toUpperCase();
  if (s === 'READY') return 'Completed';
  if (s === 'RENDERING') return 'Rendering';
  if (s === 'QUEUED' || s === 'PENDING' || s === 'GENERATING') return 'Generating';
  if (s === 'FAILED' || s === 'ERROR' || s === 'CANCELLED') return 'Processing';
  return 'Processing';
}

export async function pollVideo(token: string, orgId: string, videoId: string, onStatus: (status: string) => void, maxMs = 15 * 60_000): Promise<'completed' | 'processing' | 'session' | 'failed'> {
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
    if (['FAILED', 'ERROR', 'CANCELLED'].includes(st)) return 'failed';
    await new Promise((res) => setTimeout(res, 3000));
  }
  return 'processing';
}

export async function requeueVideo(session: StudioSession, orgId: string, videoId: string): Promise<boolean> {
  const token = session.tokens?.accessToken;
  if (!token || session.mode !== 'api') return false;
  const r = await regenerateVideo(token, orgId, videoId);
  return r.reachable !== false && r.ok;
}
