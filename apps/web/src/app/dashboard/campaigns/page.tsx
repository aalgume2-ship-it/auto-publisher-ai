'use client';

/**
 * Campaigns / Calendar — real automation.
 * Create a campaign (platforms, schedule, time-of-day, content mode,
 * reference images, AI captions/hashtags). The worker scheduler materializes
 * posts at the scheduled time → generation jobs → publish. Statuses:
 * Scheduled / Generating / Ready / Published / Failed.
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Play, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import AppShell from '../../../components/dashboard/app-shell';
import { api, ApiProblem, arabicMessage } from '../../../lib/api';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

interface Campaign {
  id: string; name: string; platforms: string[]; cadence: string; timeOfDay: string;
  timezone: string; contentMode: string; status: string; nextRunAt: string | null;
  lastRunAt: string | null; createdAt: string;
  recentPosts?: Array<{ id: string; platform: string; status: string; scheduledFor: string; failureReason: string | null }>;
}
interface CalendarEvent {
  id: string; kind: string; platform: string; status: string; scheduledFor: string | null;
  title: string; failureReason: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Scheduled', GENERATING: 'Generating', READY: 'Ready', PUBLISHED: 'Published',
  FAILED: 'Failed', CANCELLED: 'Cancelled', QUEUED: 'Queued', UPLOADING: 'Uploading',
};

export default function CampaignsPage() {
  const { session, ready } = useAuthenticatedSession();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['youtube', 'tiktok']);
  const [cadence, setCadence] = useState('daily');
  const [timeOfDay, setTimeOfDay] = useState('18:00');
  const [timezone, setTimezone] = useState('UTC');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.orgId || !session.accessToken) return;
    try {
      const [c, e] = await Promise.all([
        api.get<{ items: Campaign[] }>(`/v1/organizations/${session.orgId}/campaigns`, session.accessToken),
        api.get<{ items: CalendarEvent[] }>(`/v1/organizations/${session.orgId}/calendar`, session.accessToken),
      ]);
      setCampaigns(c.items);
      setEvents(e.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'Failed to load campaigns');
    }
  }, [session]);

  useEffect(() => {
    if (ready && session?.orgId && campaigns === null) void load();
  }, [ready, session, campaigns, load]);

  async function create() {
    if (!session?.orgId || !session.accessToken) return;
    setBusy('create'); setError(null);
    try {
      await api.post(`/v1/organizations/${session.orgId}/campaigns`, {
        name, platforms, cadence, timeOfDay, timezone, contentMode: 'auto',
        referenceImageIds: [], config: { captions: 'ai', hashtags: 'ai' },
      }, session.accessToken);
      setName(''); setShowForm(false); setNotice('Campaign created — scheduler will run it at the configured time.');
      await load();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runNow(id: string) {
    if (!session?.orgId || !session.accessToken) return;
    setBusy(id); setError(null);
    try {
      await api.post(`/v1/organizations/${session.orgId}/campaigns/${id}/run`, {}, session.accessToken);
      setNotice('Run triggered — generation jobs enqueued.');
      await load();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!session?.orgId || !session.accessToken) return;
    setBusy(`del-${id}`);
    try {
      await api.del(`/v1/organizations/${session.orgId}/campaigns/${id}`, session.accessToken);
      await load();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!ready || !session) return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;

  return (
    <AppShell session={session} title="Calendar & Automation" subtitle="Campaigns: schedule → generate → publish, fully automated by the worker.">
      {notice && <div className="alert ok">{notice}</div>}
      {error && <div className="alert err">{error}</div>}
      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}><Plus size={16} /> New campaign</button>
        <button className="btn btn-ghost" onClick={() => void load()}><RefreshCcw size={15} /></button>
      </div>

      {showForm && (
        <div className="glass-card" style={{ padding: 22, marginBottom: 16 }}>
          <div className="grid-2">
            <div>
              <label className="sm muted">Campaign name</label>
              <input className="input" style={{ width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Daily content" />
            </div>
            <div>
              <label className="sm muted">Platforms</label>
              <div className="row" style={{ gap: 8 }}>
                {['youtube', 'tiktok', 'instagram'].map((p) => (
                  <label key={p} className="chip" style={{ cursor: 'pointer', display: 'inline-flex', gap: 6 }}>
                    <input type="checkbox" checked={platforms.includes(p)} onChange={(e) => setPlatforms(e.target.checked ? [...platforms, p] : platforms.filter((x) => x !== p))} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="sm muted">Cadence</label>
              <select className="input" style={{ width: '100%' }} value={cadence} onChange={(e) => setCadence(e.target.value)}>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="sm muted">Time (HH:mm)</label>
              <input className="input" style={{ width: '100%' }} type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
            </div>
            <div>
              <label className="sm muted">Timezone</label>
              <input className="input" style={{ width: '100%' }} value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Riyadh" />
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={busy === 'create' || name.trim().length < 2 || platforms.length === 0} onClick={create}>
            Create campaign
          </button>
        </div>
      )}

      <div className="grid-2">
        <div className="glass-card" style={{ padding: 22 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 12 }}>Campaigns</h3>
          {campaigns === null ? <div className="skel" style={{ height: 100 }} /> : campaigns.length === 0 ? (
            <p className="muted">No campaigns yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {campaigns.map((c) => (
                <div key={c.id} className="glass-panel" style={{ padding: 14 }}>
                  <div className="row between">
                    <div>
                      <strong>{c.name}</strong>
                      <p className="sm muted">{c.platforms.join(' + ')} · {c.cadence} at {c.timeOfDay} ({c.timezone})</p>
                    </div>
                    <span className={`chip ${c.status === 'ACTIVE' ? 'on' : ''}`}>{c.status}</span>
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 10 }}>
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy !== null} onClick={() => runNow(c.id)}><Play size={13} /> Run now</button>
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy !== null} onClick={() => remove(c.id)}><Trash2 size={13} /> Delete</button>
                  </div>
                  {c.recentPosts && c.recentPosts.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {c.recentPosts.map((p) => (
                        <div key={p.id} className="row between sm">
                          <span>{p.platform} · {new Date(p.scheduledFor).toLocaleString()}</span>
                          <span className={`chip ${p.status === 'PUBLISHED' ? 'on' : p.status === 'FAILED' ? '' : 'pending'}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {c.nextRunAt && <p className="sm muted" style={{ marginTop: 8 }}>Next run: {new Date(c.nextRunAt).toLocaleString()}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card" style={{ padding: 22 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 12 }}>Calendar</h3>
          {events.length === 0 ? <p className="muted">No scheduled events.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {events.slice(0, 40).map((ev) => (
                <div key={ev.id} className="row between glass-panel" style={{ padding: 10 }}>
                  <div>
                    <strong className="sm">{ev.title.slice(0, 50)}</strong>
                    <p className="sm muted">{ev.kind === 'campaign' ? 'Campaign' : 'Publish'} · {ev.platform} · {ev.scheduledFor ? new Date(ev.scheduledFor).toLocaleString() : 'now'}</p>
                    {ev.failureReason && <p className="sm" style={{ color: '#e06060' }}>{ev.failureReason}</p>}
                  </div>
                  <span className={`chip ${ev.status === 'PUBLISHED' ? 'on' : ev.status === 'FAILED' ? '' : 'pending'}`}>{STATUS_LABEL[ev.status] ?? ev.status}</span>
                </div>
              ))}
            </div>
          )}
          <p className="sm muted" style={{ marginTop: 12 }}><CalendarClock size={13} /> Events are created by the worker scheduler from active campaigns.</p>
        </div>
      </div>
    </AppShell>
  );
}
