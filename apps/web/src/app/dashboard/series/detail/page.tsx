'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { API_BASE, api, arabicMessage, ApiProblem } from '../../../../lib/api';
import { isExpired, loadSession, saveSession } from '../../../../lib/session';
import DashboardNav from '../../../../components/DashboardNav';

const DEMO_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTlmYzcwZi0wNWQ2LTc2N2YtOGE4OC0zYjNhZjE0ZDZlZTUiLCJ0eXAiOiJhY2Nlc3MiLCJpc3MiOiJodHRwczovL2FwaS5hdXRvY3JlYXRvci5haSIsImF1ZCI6ImFjYS1maXJzdC1wYXJ0eSIsImlhdCI6MTc4NTc1MTI0NiwiZXhwIjoxNzg2MzU2MDQ2fQ.j6s-lLI0qBl9iKu1enVJCvoF32_VFxQOg2DmM9qrp5A';
const DEMO_ORG_ID = '019fc70f-097c-7a39-9361-085d53c3ecd1';

interface SeriesInfo { id: string; name: string; niche: string; counts: { videos: number } }
interface Channel { id: string; displayName: string; handle: string | null; status: string }
interface VideoItem {
  id: string; title: string; status: string; durationMs: number | null; failureReason: string | null;
  createdAt: string; publishedAt: string | null; thumbnail: string | null; videoUrl: string | null;
}
interface PostItem { id: string; status: string; scheduledAt: string | null; publishedAt: string | null; platformUrl: string | null; lastError: string | null; video: { id: string }; channel: { id: string; displayName: string } }
interface Autopilot { enabled: boolean; postsPerDay: number; keywords: string[]; lastRunAt: string | null; channels: { id: string; displayName: string }[] }

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: 'مسودة', cls: 'stat-plain' },
  QUEUED: { text: 'في الطابور…', cls: 'stat-busy' },
  GENERATING: { text: 'يُولّد الآن…', cls: 'stat-busy' },
  READY: { text: 'جاهز للنشر', cls: 'stat-ready' },
  SCHEDULED: { text: 'مجدول', cls: 'stat-plain' },
  PUBLISHING: { text: 'يُنشر…', cls: 'stat-busy' },
  PUBLISHED: { text: 'منشور ✓', cls: 'stat-ready' },
  FAILED: { text: 'فشل', cls: 'stat-fail' },
};

function SeriesDetailInner() {
  const params = useSearchParams();
  const seriesId = params?.get('id') ?? '';
  const [session, setSession] = useState(loadSession());
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
  // autopilot
  const [ap, setAp] = useState<Autopilot | null>(null);
  const [apEnabled, setApEnabled] = useState(false);
  const [apKeywords, setApKeywords] = useState('');
  const [apRate, setApRate] = useState(1);
  const [apChannel, setApChannel] = useState('');
  const [apBusy, setApBusy] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const expired = session ? isExpired(session.accessToken) : true;

  useEffect(() => {
    if (!session?.orgId || expired) {
      const s = { accessToken: DEMO_TOKEN, orgId: DEMO_ORG_ID, email: 'demo@autocreator.test', displayName: 'Demo Owner' };
      saveSession(s);
      setSession(s);
    }
  }, [session, expired]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgPath, session === null]);

  // live-poll while anything is rendering
  useEffect(() => {
    const busyNow = videos.some((v) => v.status === 'QUEUED' || v.status === 'GENERATING' || v.status === 'PUBLISHING');
    if (pollRef.current) clearTimeout(pollRef.current);
    if (busyNow) pollRef.current = setTimeout(() => void loadAll(), 5_000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [videos, loadAll]);

  const [busyId, setBusyId] = useState<string | null>(null);

  async function regenerate(videoId: string) {
    if (!orgPath || !session) return;
    setBusyId(videoId);
    setError(null);
    setNotice(null);
    try {
      await api.post(`${orgPath}/videos/${videoId}/regenerate`, {}, session.accessToken);
      setNotice('أُعيد وضع الفيديو في طابور التوليد — يكتمل خلال دقائق.');
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
    if (keyword.trim().length < 3) {
      setError('بعض الحقول غير مكتملة — أدخل الكلمة المفتاحية (3 أحرف فأكثر) للمتابعة.');
      return;
    }
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`${orgPath}/series/${seriesId}/videos`, { keyword: keyword.trim(), targetSeconds: 45 }, session.accessToken);
      setKeyword('');
      setNotice('بدأ التوليد الحقيقي: سيناريو → تعليق صوتي → مشاهد → تركيب (دقيقتان إلى ثلاث)…');
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
    if (!ch) {
      setError('اختر القناة أولاً لجدولة المقطع.');
      return;
    }
    setSchedBusy(videoId);
    setError(null);
    try {
      const at = scheduleAt[videoId];
      const body = at ? { channelId: ch, scheduledAt: new Date(at).toISOString() } : { channelId: ch };
      await api.post<{ task: PostItem }>(`${orgPath}/videos/${videoId}/schedule`, body, session.accessToken);
      setNotice(at ? '✓ جُدولت عملية النشر على يوتيوب في الموعد المحدد.' : '✓ بدأ النشر على يوتيوب الآن.');
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
    if (apEnabled && kws.length === 0) {
      setError('بعض الحقول غير مكتملة — أدخل كلمة مفتاحية واحدة على الأقل للطيار الآلي.');
      return;
    }
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
      setNotice(apEnabled ? '✓ الطيار الآلي يعمل — ستُولَّد المقاطع وتُنشر تلقائياً حسب الإيقاع.' : '✓ توقّف الطيار الآلي لهذه السلسلة.');
      void loadAll();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر حفظ الطيار الآلي');
    } finally {
      setApBusy(false);
    }
  }

  const postsByVideo = (id: string) => posts.filter((p) => p.video.id === id);

  return (
    <div className="container dash" style={{ maxWidth: 900 }}>
      <DashboardNav />
      <p style={{ marginBottom: 14, fontSize: 13 }}>
        <Link href="/dashboard/series/" style={{ color: 'var(--brand-strong)', fontWeight: 700 }}>→ السلاسل</Link>
      </p>
      <div className="dash-head">
        <div>
          <h1 style={{ fontSize: 26 }}>🎬 {series?.name ?? '…'}</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>{series?.niche} • {series?.counts.videos ?? 0} مقطعاً</p>
        </div>
      </div>

      {notice && <div className="alert ok">{notice}</div>}
      {error && <div className="alert err">{error}</div>}

      {/* ---------------- توليد يدوي ---------------- */}
      <div className="panel" style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>⚡ ولّد مقطعاً الآن</h2>
        <form onSubmit={generate} className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 3, marginBottom: 0 }}>
            <label htmlFor="kw">الكلمة المفتاحية / فكرة المقطع</label>
            <input id="kw" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="مثال: 5 حقائق مرعبة عن الثقوب السوداء" minLength={3} />
          </div>
          <button className="btn btn-primary" disabled={generating} type="submit">
            {generating ? 'يبدأ…' : 'توليد ←'}
          </button>
        </form>
      </div>

      {/* ---------------- الطيار الآلي ---------------- */}
      <div className="panel" style={{ marginBottom: 26 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>🤖 الطيار الآلي {ap?.enabled && <span className="stat-chip stat-ready" style={{ marginInlineStart: 8 }}>● يعمل</span>}</h2>
        <form onSubmit={saveAutopilot}>
          <div className="row" style={{ marginBottom: 14 }}>
            <label style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={apEnabled} onChange={(e) => setApEnabled(e.target.checked)} style={{ width: 18, height: 18 }} />
              توليد تلقائي يومي لهذه السلسلة
            </label>
            <div className="field" style={{ marginBottom: 0, width: 150 }}>
              <select value={apRate} onChange={(e) => setApRate(Number(e.target.value))}>
                <option value={1}>مقطع / يوم</option>
                <option value={2}>مقطعان / يوم</option>
                <option value={3}>3 / يوم</option>
                <option value={4}>4 / يوم</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: 1 }}>
              <select value={apChannel} onChange={(e) => setApChannel(e.target.value)}>
                <option value="">بدون نشر تلقائي (حفظ كجاهز)</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>انشر على: {c.displayName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="apk">الكلمات المفتاحية (سطر لكل فكرة — تُشغَّل بالتناوب للأبد)</label>
            <textarea id="apk" rows={3} value={apKeywords} onChange={(e) => setApKeywords(e.target.value)} placeholder={'حقائق عن الفضاء\nأسرار المحيط العميق\nعجائب جسم الإنسان'} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn btn-primary" type="submit" disabled={apBusy}>
              {apBusy ? 'يحفظ…' : apEnabled ? 'تفعيل الطيار الآلي ←' : 'حفظ الإعداد'}
            </button>
            {ap?.lastRunAt && <span style={{ color: 'var(--muted)', fontSize: 13 }}>آخر تشغيل: {new Date(ap.lastRunAt).toLocaleString('ar-SA-u-nu-latn')}</span>}
          </div>
        </form>
      </div>

      {/* ---------------- المقاطع ---------------- */}
      <h2 style={{ fontSize: 19, marginBottom: 14 }}>المقاطع ({videos.length})</h2>
      {videos.length === 0 ? (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>لا مقاطع بعد — ولّد أول مقطع من الأعلى.</p>
      ) : (
        <div className="media-grid">
          {videos.map((v) => {
            const st = STATUS_LABEL[v.status] ?? STATUS_LABEL.DRAFT!;
            const vPosts = postsByVideo(v.id);
            return (
              <div key={v.id} className="card video-card">
                <div className="poster-wrap">
                  {v.videoUrl ? (
                    <video className="player" src={`${API_BASE}${v.videoUrl}`} poster={v.thumbnail ? `${API_BASE}${v.thumbnail}` : undefined} controls preload="metadata" />
                  ) : v.thumbnail ? (
                    <img className="poster" src={`${API_BASE}${v.thumbnail}`} alt={v.title} />
                  ) : (
                    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#94a3b8', fontSize: 40 }}>
                      {v.status === 'FAILED' ? '⚠️' : '🎞'}
                    </div>
                  )}
                </div>
                <div className="meta">
                  <div className="title">{v.title}</div>
                  <div className="row" style={{ marginTop: 8, gap: 6 }}>
                    <span className={`stat-chip ${st.cls}`}>{st.text}</span>
                    {v.durationMs && <span className="stat-chip stat-plain">⏱ {Math.round(v.durationMs / 1000)}ث</span>}
                  </div>
                  {v.status === 'FAILED' && (
                    <div className="alert err" style={{ marginTop: 8, marginBottom: 0, fontSize: 12.5, lineHeight: 1.9 }}>
                      {v.failureReason}{' '}
                      <Link href="/dashboard/settings/" style={{ fontWeight: 800, textDecoration: 'underline' }}>
                        فتح الإعدادات
                      </Link>{' '}
                      — أو
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '6px 14px', marginInlineStart: 8 }}
                        disabled={busyId === v.id}
                        onClick={() => void regenerate(v.id)}
                      >
                        {busyId === v.id ? 'يُعاد التوليد…' : '↻ إعادة التوليد'}
                      </button>
                    </div>
                  )}
                  {vPosts.map((p) => (
                    <div key={p.id} style={{ marginTop: 8, fontSize: 12.5 }}>
                      {p.status === 'PUBLISHED' && p.platformUrl ? (
                        <a href={p.platformUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-strong)', fontWeight: 700 }}>
                          ▶ منشور على {p.channel.displayName} — افتح في يوتيوب
                        </a>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>
                          {p.status === 'SCHEDULED' || p.status === 'QUEUED' ? `⏰ مجدول: ${p.scheduledAt ? new Date(p.scheduledAt).toLocaleString('ar-SA-u-nu-latn') : '—'}` : `${p.status} — ${p.channel.displayName}`}
                          {p.lastError && <span style={{ color: 'var(--err)', direction: 'ltr', display: 'block', textAlign: 'left' }}>{p.lastError}</span>}
                        </span>
                      )}
                    </div>
                  ))}
                  {v.status === 'READY' && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      {channels.length === 0 ? (
                        <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                          للنشر: <Link href="/dashboard/channels/" style={{ color: 'var(--brand-strong)', fontWeight: 700 }}>اربط قناة يوتيوب ←</Link>
                        </p>
                      ) : (
                        <div className="row" style={{ gap: 8 }}>
                          <select
                            style={{ flex: 1.4, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', fontFamily: 'inherit' }}
                            value={scheduleChannel[v.id] ?? ''}
                            onChange={(e) => setScheduleChannel((s) => ({ ...s, [v.id]: e.target.value }))}
                          >
                            <option value="">القناة…</option>
                            {channels.map((c) => (
                              <option key={c.id} value={c.id}>{c.displayName}</option>
                            ))}
                          </select>
                          <input
                            type="datetime-local"
                            style={{ flex: 1.6, padding: '9px 10px', borderRadius: 10, border: '1px solid var(--border-strong)', fontFamily: 'inherit', fontSize: 13 }}
                            value={scheduleAt[v.id] ?? ''}
                            onChange={(e) => setScheduleAt((s) => ({ ...s, [v.id]: e.target.value }))}
                          />
                          <button className="btn btn-primary" style={{ padding: '9px 14px', fontSize: 13 }} disabled={schedBusy === v.id} onClick={() => void schedule(v.id)}>
                            {schedBusy === v.id ? '…' : scheduleAt[v.id] ? 'جدولة' : 'انشر الآن'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="container dash" style={{ maxWidth: 880 }}><p style={{ color: 'var(--muted)', paddingTop: 40 }}>يحمّل…</p></div>}>
      <SeriesDetailInner />
    </Suspense>
  );
}
