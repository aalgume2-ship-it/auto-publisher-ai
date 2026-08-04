'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Clapperboard, PlayCircle, Sparkles, Wand2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import AppShell from '../../../../components/dashboard/app-shell';
import { EmptyState, GlassCard, SectionHeader, StatTile } from '../../../../components/ui/chrome';
import { HoverLift, Reveal } from '../../../../components/ui/reveal';
import { API_BASE, api, arabicMessage, ApiProblem } from '../../../../lib/api';
import { useAuthenticatedSession } from '../../../../lib/use-authenticated-session';

interface SeriesInfo { id: string; name: string; niche: string; counts: { videos: number } }
interface Channel { id: string; displayName: string; handle: string | null; status: string }
interface VideoItem {
  id: string; title: string; status: string; durationMs: number | null; failureReason: string | null;
  createdAt: string; publishedAt: string | null; thumbnail: string | null; videoUrl: string | null;
  seo?: { step?: string; engine?: string; wallMs?: number; provider?: string } | null;
}
interface PostItem { id: string; status: string; scheduledAt: string | null; publishedAt: string | null; platformUrl: string | null; lastError: string | null; video: { id: string }; channel: { id: string; displayName: string } }
interface Autopilot { enabled: boolean; postsPerDay: number; keywords: string[]; lastRunAt: string | null; channels: { id: string; displayName: string }[] }

const STEP_LABEL: Record<string, string> = {
  script: 'Script generation',
  voice: 'Voiceover synthesis',
  scenes: 'Scene generation',
  clips: 'Animated scene clips',
  render: 'Final render',
  ready: 'Ready',
};

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: 'Draft', cls: 'stat-plain' },
  QUEUED: { text: 'Queued', cls: 'stat-busy' },
  GENERATING: { text: 'Generating', cls: 'stat-busy' },
  READY: { text: 'Ready', cls: 'stat-ready' },
  SCHEDULED: { text: 'Scheduled', cls: 'stat-plain' },
  PUBLISHING: { text: 'Publishing', cls: 'stat-busy' },
  PUBLISHED: { text: 'Published', cls: 'stat-ready' },
  FAILED: { text: 'Failed', cls: 'stat-fail' },
};

function liveStep(v: VideoItem): string | null {
  const raw = v.status === 'GENERATING' || v.status === 'QUEUED' ? v.seo?.step : undefined;
  if (!raw) return null;
  const [key, count] = raw.split(' ');
  const label = STEP_LABEL[key ?? ''] ?? raw;
  return count ? `${label} — ${count}` : label;
}

function engineBadge(v: VideoItem): string | null {
  const e = v.seo?.engine;
  if (v.status !== 'READY' || !e) return null;
  return e.endsWith('-clips') ? 'AI Motion' : 'Cinematic Stills';
}

function SeriesDetailInner() {
  const params = useSearchParams();
  const seriesId = params?.get('id') ?? '';
  const { session, ready } = useAuthenticatedSession();
  const [series, setSeries] = useState<SeriesInfo | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [generating, setGenerating] = useState(false);
  const [scheduleChannel, setScheduleChannel] = useState<Record<string, string>>({});
  const [scheduleAt, setScheduleAt] = useState<Record<string, string>>({});
  const [schedBusy, setSchedBusy] = useState<string | null>(null);
  const [ap, setAp] = useState<Autopilot | null>(null);
  const [apEnabled, setApEnabled] = useState(false);
  const [apKeywords, setApKeywords] = useState('');
  const [apRate, setApRate] = useState(1);
  const [apChannel, setApChannel] = useState('');
  const [apBusy, setApBusy] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const orgPath = useMemo(() => (session?.orgId ? `/v1/organizations/${session.orgId}` : null), [session]);

  const loadAll = useCallback(async () => {
    if (!orgPath || !session) return;
    try {
      const [s, v, p, c, a] = await Promise.all([
        api.get<SeriesInfo>(`${orgPath}/series/${seriesId}`, session.accessToken),
        api.get<{ items: VideoItem[] }>(`${orgPath}/videos?seriesId=${seriesId}`, session.accessToken),
        api.get<{ items: PostItem[] }>(`${orgPath}/posts`, session.accessToken),
        api.get<{ items: Channel[] }>(`${orgPath}/channels`, session.accessToken),
        api.get<{ config: Autopilot | null }>(`${orgPath}/series/${seriesId}/autopilot`, session.accessToken),
      ]);
      setSeries(s);
      setVideos(v.items);
      setPosts(p.items.filter((t) => v.items.some((x) => x.id === t.video.id)));
      setChannels(c.items);
      if (a.config && !ap) {
        setAp(a.config);
        setApEnabled(a.config.enabled);
        setApKeywords(a.config.keywords.join('\n'));
        setApRate(a.config.postsPerDay);
        setApChannel(a.config.channels[0]?.id ?? '');
      }
    } catch (e) {
      setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل السلسلة');
    }
  }, [orgPath, session, seriesId, ap]);

  useEffect(() => {
    if (orgPath && session) void loadAll();
  }, [orgPath, session, loadAll]);

  useEffect(() => {
    const busyNow = videos.some((v) => v.status === 'QUEUED' || v.status === 'GENERATING' || v.status === 'PUBLISHING');
    if (pollRef.current) clearTimeout(pollRef.current);
    if (busyNow) pollRef.current = setTimeout(() => void loadAll(), 5_000);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [videos, loadAll]);

  async function regenerate(videoId: string) {
    if (!orgPath || !session) return;
    setBusyId(videoId);
    setError(null);
    setNotice(null);
    try {
      await api.post(`${orgPath}/videos/${videoId}/regenerate`, {}, session.accessToken);
      setNotice('Video was re-queued for generation.');
      void loadAll();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّرت إعادة التوليد');
    } finally {
      setBusyId(null);
    }
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgPath || !session) return;
    if (keyword.trim().length < 3) return setError('أدخل كلمة مفتاحية من 3 أحرف على الأقل.');
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`${orgPath}/series/${seriesId}/videos`, { keyword: keyword.trim(), targetSeconds: 45 }, session.accessToken);
      setKeyword('');
      setNotice('Started full generation: script → voice → scenes → render.');
      void loadAll();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر بدء التوليد');
    } finally {
      setGenerating(false);
    }
  }

  async function schedule(videoId: string) {
    if (!orgPath || !session) return;
    const ch = scheduleChannel[videoId];
    if (!ch) return setError('اختر القناة أولاً لجدولة المقطع.');
    setSchedBusy(videoId);
    setError(null);
    try {
      const at = scheduleAt[videoId];
      const body = at ? { channelId: ch, scheduledAt: new Date(at).toISOString() } : { channelId: ch };
      await api.post<{ task: PostItem }>(`${orgPath}/videos/${videoId}/schedule`, body, session.accessToken);
      setNotice(at ? 'Publishing task scheduled successfully.' : 'Publishing started immediately.');
      void loadAll();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر إنشاء مهمة النشر');
    } finally {
      setSchedBusy(null);
    }
  }

  async function saveAutopilot(e: React.FormEvent) {
    e.preventDefault();
    if (!orgPath || !session) return;
    const kws = apKeywords.split('\n').map((k) => k.trim()).filter(Boolean);
    if (apEnabled && kws.length === 0) return setError('أدخل كلمة مفتاحية واحدة على الأقل للطيار الآلي.');
    setApBusy(true);
    setError(null);
    try {
      const res = await api.post<{ config: Autopilot }>(`${orgPath}/series/${seriesId}/autopilot`, {
        enabled: apEnabled,
        keywords: kws.length > 0 ? kws : [series?.niche ?? 'حقائق مدهشة'],
        postsPerDay: apRate,
        channelIds: apChannel ? [apChannel] : [],
      }, session.accessToken);
      setAp(res.config);
      setNotice(apEnabled ? 'Autopilot saved and enabled.' : 'Autopilot configuration updated.');
      void loadAll();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر حفظ الطيار الآلي');
    } finally {
      setApBusy(false);
    }
  }

  const postsByVideo = (id: string) => posts.filter((p) => p.video.id === id);

  if (!ready || !session) return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;

  return (
    <AppShell
      session={session}
      title={series?.name ?? 'Series Studio'}
      subtitle={series ? `${series.niche} • ${series.counts.videos} outputs` : 'Prompt, generate, review and publish from a single premium studio surface.'}
      actions={<Link className="btn btn-ghost" href="/dashboard/series/">Back to Series</Link>}
    >
      {notice && <div className="alert ok">{notice}</div>}
      {error && <div className="alert err">{error}</div>}

      <Reveal>
        <div className="section-grid three">
          <StatTile label="Videos" value={videos.length} hint="Outputs currently attached to this series." />
          <StatTile label="Channels" value={channels.length} hint="Available destinations for immediate publishing." />
          <StatTile label="Autopilot" value={apEnabled ? 'ON' : 'OFF'} hint="Continuous daily generation state." />
        </div>
      </Reveal>

      <div className="section-grid two">
        <Reveal>
          <GlassCard>
            <SectionHeader eyebrow="Create Video" title="Generate the next output." body="Enter a strong topic and the system will run the full production chain for this series." />
            <form onSubmit={generate}>
              <div className="field">
                <label htmlFor="kw">Prompt / keyword</label>
                <input id="kw" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Black holes facts / product launch / daily business insight" minLength={3} />
              </div>
              <button className="btn btn-primary" disabled={generating} type="submit"><Wand2 size={16} /> {generating ? 'Launching…' : 'Generate Video'}</button>
            </form>
          </GlassCard>
        </Reveal>

        <Reveal delay={0.08}>
          <GlassCard>
            <SectionHeader eyebrow="Autopilot" title="Continuous publishing rhythm." body="Keep a daily creative cadence by assigning keywords, channel targets and output frequency." />
            <form onSubmit={saveAutopilot}>
              <div className="row" style={{ marginBottom: 14 }}>
                <label className="row" style={{ alignItems: 'center' }}>
                  <input type="checkbox" checked={apEnabled} onChange={(e) => setApEnabled(e.target.checked)} style={{ width: 18, height: 18 }} />
                  <span>Enable Autopilot</span>
                </label>
                <div className="field" style={{ marginBottom: 0, width: 170 }}>
                  <select value={apRate} onChange={(e) => setApRate(Number(e.target.value))}>
                    <option value={1}>1 video / day</option>
                    <option value={2}>2 videos / day</option>
                    <option value={3}>3 videos / day</option>
                    <option value={4}>4 videos / day</option>
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                  <select value={apChannel} onChange={(e) => setApChannel(e.target.value)}>
                    <option value="">Store as READY only</option>
                    {channels.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="apk">Autopilot keywords</label>
                <textarea id="apk" rows={4} value={apKeywords} onChange={(e) => setApKeywords(e.target.value)} placeholder={'Brand myths\nSpace facts\nProduct explainers'} />
              </div>
              <div className="row">
                <button className="btn btn-primary" type="submit" disabled={apBusy}><Sparkles size={16} /> {apBusy ? 'Saving…' : 'Save Autopilot'}</button>
                {ap?.lastRunAt && <span className="stat-chip stat-plain"><CalendarClock size={14} /> Last run {new Date(ap.lastRunAt).toLocaleString('en-GB')}</span>}
              </div>
            </form>
          </GlassCard>
        </Reveal>
      </div>

      <Reveal>
        <GlassCard>
          <SectionHeader eyebrow="Recent Outputs" title="Generated videos in this studio." body="Review current pipeline results, publish READY videos, and re-run failed outputs without leaving the workspace." />
          {videos.length === 0 ? (
            <EmptyState title="No videos yet" body="Generate the first video above to start building this series output history." />
          ) : (
            <div className="media-grid">
              {videos.map((v, index) => {
                const st = STATUS_LABEL[v.status] ?? STATUS_LABEL.DRAFT!;
                const vPosts = postsByVideo(v.id);
                const step = liveStep(v);
                const engine = engineBadge(v);
                return (
                  <Reveal key={v.id} delay={index * 0.03}>
                    <HoverLift>
                      <div className="glass-card video-card">
                        <div className="poster-wrap">
                          {v.videoUrl ? (
                            <video className="player" src={`${API_BASE}${v.videoUrl}`} poster={v.thumbnail ? `${API_BASE}${v.thumbnail}` : undefined} controls preload="metadata" />
                          ) : v.thumbnail ? (
                            <img className="poster" src={`${API_BASE}${v.thumbnail}`} alt={v.title} />
                          ) : (
                            <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)', fontSize: 44 }}><Clapperboard size={42} /></div>
                          )}
                        </div>
                        <div className="meta">
                          <div className="title">{v.title}</div>
                          <div className="row" style={{ marginTop: 10 }}>
                            <span className={`stat-chip ${st.cls}`}>{st.text}</span>
                            {v.durationMs && <span className="stat-chip stat-plain">{Math.round(v.durationMs / 1000)}s</span>}
                            {engine && <span className="stat-chip stat-plain">{engine}</span>}
                          </div>
                          {step && <p style={{ marginTop: 12, color: 'var(--brand-alt)' }}>{step}</p>}
                          {v.status === 'FAILED' && (
                            <div className="alert err" style={{ marginTop: 14 }}>
                              {v.failureReason}
                              <div className="row" style={{ marginTop: 10 }}>
                                <Link className="btn btn-ghost" href="/dashboard/settings/">Open Settings</Link>
                                <button className="btn btn-ghost" disabled={busyId === v.id} onClick={() => void regenerate(v.id)}>{busyId === v.id ? 'Re-queueing…' : 'Regenerate'}</button>
                              </div>
                            </div>
                          )}
                          {vPosts.map((p) => (
                            <div key={p.id} className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
                              <span className="stat-chip stat-plain">{p.status} • {p.channel.displayName}</span>
                              {p.status === 'PUBLISHED' && p.platformUrl && <a className="btn btn-ghost" href={p.platformUrl} target="_blank" rel="noreferrer"><PlayCircle size={16} /> Open Live</a>}
                            </div>
                          ))}
                          {v.status === 'READY' && (
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                              {channels.length === 0 ? (
                                <p className="form-note">No channels yet — <Link href="/dashboard/channels/">connect one</Link>.</p>
                              ) : (
                                <div className="section-grid two">
                                  <div className="field" style={{ marginBottom: 0 }}>
                                    <label>Channel</label>
                                    <select value={scheduleChannel[v.id] ?? ''} onChange={(e) => setScheduleChannel((s) => ({ ...s, [v.id]: e.target.value }))}>
                                      <option value="">Select channel</option>
                                      {channels.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
                                    </select>
                                  </div>
                                  <div className="field" style={{ marginBottom: 0 }}>
                                    <label>Schedule time</label>
                                    <input type="datetime-local" value={scheduleAt[v.id] ?? ''} onChange={(e) => setScheduleAt((s) => ({ ...s, [v.id]: e.target.value }))} />
                                  </div>
                                  <button className="btn btn-primary" style={{ gridColumn: '1 / -1' }} disabled={schedBusy === v.id} onClick={() => void schedule(v.id)}>{schedBusy === v.id ? 'Scheduling…' : scheduleAt[v.id] ? 'Schedule Publish' : 'Publish Now'}</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </HoverLift>
                  </Reveal>
                );
              })}
            </div>
          )}
        </GlassCard>
      </Reveal>
    </AppShell>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Loading series studio…</div></div>}><SeriesDetailInner /></Suspense>;
}
