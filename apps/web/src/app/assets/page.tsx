'use client';

/**
 * مكتبة الأصول الواقعية — the offline-production import bridge.
 *
 * The generation server may run without internet (air-gapped / sandboxed),
 * but THIS browser usually has full network access. The page therefore
 * fetches neural voice packs (Piper ONNX from Hugging Face) and real
 * footage clips (Wikimedia Commons / direct URLs / device files) HERE,
 * then streams the raw bytes to the server's local-media endpoints
 * (application/octet-stream). After import, every locally generated video
 * automatically uses the neural voice for narration and topic-matched
 * real footage for its scenes.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AudioLines, Check, CloudDownload, Film, HardDriveDownload, Link2, Loader2, RefreshCw,
  Search, Trash2, UploadCloud, Wand2,
} from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { ensureGuestSession, loadStudioSession, tryRefreshToken } from '../../lib/studio-session';
import { listOrgs, createOrg } from '../../lib/studio-api';

/* ───────────────────────── voice catalog ───────────────────────── */

interface VoicePack {
  id: string;
  label: string;
  lang: string;
  note: string;
  files: { name: string; url: string }[];
}

const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
const VOICE_PACKS: VoicePack[] = [
  {
    id: 'ar-jo-kareem',
    label: 'صوت عربي عصبي — كريم (الأردن)',
    lang: 'العربية',
    note: 'صوت رجالي عصبي طبيعي يعمل محليًا بالكامل. الحجم ~63MB.',
    files: [
      { name: 'ar_JO-kareem-medium.onnx', url: `${HF}/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx` },
      { name: 'ar_JO-kareem-medium.onnx.json', url: `${HF}/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx.json` },
    ],
  },
  {
    id: 'en-us-ryan',
    label: 'صوت إنجليزي عصبي — Ryan (US)',
    lang: 'English',
    note: 'صوت رجالي إنجليزي طبيعي. الحجم ~63MB.',
    files: [
      { name: 'en_US-ryan-medium.onnx', url: `${HF}/en/en_US/ryan/medium/en_US-ryan-medium.onnx` },
      { name: 'en_US-ryan-medium.onnx.json', url: `${HF}/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json` },
    ],
  },
];

/* ───────────────────────── types ───────────────────────── */

interface FootageEntry { file: string; tags: string[]; durationMs: number }
interface LibraryStatus { voices: { file: string; neural: boolean }[]; footage: FootageEntry[]; localGeneration: boolean }
type JobState = { phase: 'idle' | 'downloading' | 'uploading' | 'done' | 'error'; pct?: number; message?: string };
interface CommonsClip {
  title: string;
  url: string;
  sizeMb: number;
  durationSec?: number;
  derivative: boolean;
}

/* ───────────────────────── helpers ───────────────────────── */

async function fetchWithProgress(url: string, onPct: (pct: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  if (!res.body || !total) {
    onPct(70);
    return await res.arrayBuffer();
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onPct(Math.min(99, Math.round((received / total) * 100)));
    }
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out.buffer;
}

/* ───────────────────────── page ───────────────────────── */

function AssetsInner() {
  const [session, setSession] = useState<{ token: string; orgId: string } | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [voiceJobs, setVoiceJobs] = useState<Record<string, JobState>>({});
  const [query, setQuery] = useState('space nebula stars');
  const [searching, setSearching] = useState(false);
  const [clips, setClips] = useState<CommonsClip[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [searchError, setSearchError] = useState('');
  const [importJobs, setImportJobs] = useState<Record<string, JobState>>({});
  const [directUrl, setDirectUrl] = useState('');
  const [directTags, setDirectTags] = useState('');
  const [deviceTags, setDeviceTags] = useState('');
  const [deviceJob, setDeviceJob] = useState<JobState>({ phase: 'idle' });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const token = session?.token;
  const orgId = session?.orgId;

  const refreshStatus = useCallback(async () => {
    if (!token || !orgId) return;
    try {
      const res = await fetch(`/api/v1/organizations/${orgId}/local-media`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setStatus(await res.json() as LibraryStatus);
    } catch { /* transient */ }
  }, [token, orgId]);

  useEffect(() => {
    (async () => {
      let s = loadStudioSession();
      if (!s?.tokens?.accessToken) s = await ensureGuestSession();
      if (!s?.tokens?.accessToken) { setSessionError('تعذر تجهيز الجلسة — تأكد أن خدمة الـ API تعمل.'); return; }
      await tryRefreshToken();
      const cur = loadStudioSession() ?? s;
      const token = cur?.tokens?.accessToken;
      if (!token) { setSessionError('انتهت الجلسة — أعد تحميل الصفحة.'); return; }
      // resolve the workspace the same way the generation flow does
      let orgId = cur.orgId;
      if (!orgId) {
        const orgs = await listOrgs(token);
        orgId = orgs.ok ? orgs.data?.items?.[0]?.organization?.id : undefined;
      }
      if (!orgId) {
        const created = await createOrg(token, 'My Studio');
        orgId = created.ok ? created.data?.id : undefined;
      }
      if (!orgId) { setSessionError('تعذر الوصول إلى مساحة العمل.'); return; }
      setSession({ token, orgId });
    })().catch(() => setSessionError('تعذر تجهيز الجلسة.'));
  }, []);

  useEffect(() => { if (session) void refreshStatus(); }, [session, refreshStatus]);

  const uploadBinary = useCallback(async (kind: 'voice' | 'footage', fileName: string, body: ArrayBuffer, tags?: string[]) => {
    if (!token || !orgId) throw new Error('no session');
    const qs = new URLSearchParams({ fileName });
    if (tags?.length) qs.set('tags', tags.join(','));
    const res = await fetch(`/api/v1/organizations/${orgId}/local-media/${kind}?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` },
      body,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const j = (await res.json()) as { detail?: string; message?: string }; detail = j?.detail ?? j?.message ?? detail; } catch { /* ignore */ }
      throw new Error(detail);
    }
    return (await res.json()) as { file?: string } | null;
  }, [token, orgId]);

  const installVoicePack = useCallback(async (pack: VoicePack) => {
    setVoiceJobs((j) => ({ ...j, [pack.id]: { phase: 'downloading', pct: 0 } }));
    try {
      for (const f of pack.files) {
        setVoiceJobs((j) => ({ ...j, [pack.id]: { phase: 'downloading', pct: 0, message: f.name } }));
        const buf = await fetchWithProgress(f.url, (pct) => {
          setVoiceJobs((j) => ({ ...j, [pack.id]: { phase: 'downloading', pct, message: f.name } }));
        });
        setVoiceJobs((j) => ({ ...j, [pack.id]: { phase: 'uploading', message: f.name } }));
        await uploadBinary('voice', f.name, buf);
      }
      setVoiceJobs((j) => ({ ...j, [pack.id]: { phase: 'done' } }));
      await refreshStatus();
    } catch (e) {
      setVoiceJobs((j) => ({ ...j, [pack.id]: { phase: 'error', message: e instanceof Error ? e.message : 'فشل التحميل' } }));
    }
  }, [uploadBinary, refreshStatus]);

  const searchCommons = useCallback(async () => {
    setSearching(true); setSearchError(''); setClips([]); setSelected({});
    try {
      const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(`${query} filetype:video`)}&gsrnamespace=6&gsrlimit=24&prop=videoinfo&viprop=url|size|mime|duration|derivatives`;
      const res = await fetch(api);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const pages = (data?.query?.pages ?? {}) as Record<string, { title: string; videoinfo?: { url: string; size: number; mime: string; duration?: number; derivatives?: { src: string; type: string; width: number }[] }[] }>;
      const out: CommonsClip[] = [];
      for (const page of Object.values(pages)) {
        const vi = page.videoinfo?.[0];
        if (!vi || !vi.mime?.startsWith('video/')) continue;
        // prefer a ≤720p transcode derivative (much smaller download), else the original if reasonably sized
        const deriv = vi.derivatives?.find((d) => (d.type ?? '').includes('webm') && d.width > 0 && d.width <= 720 && d.src);
        const url = deriv?.src ?? vi.url;
        const sizeMb = (deriv ? 0 : vi.size ?? 0) / 1048576;
        if (!deriv && sizeMb > 160) continue;
        out.push({
          title: page.title.replace(/^File:/, ''),
          url,
          sizeMb: deriv ? 0 : sizeMb,
          durationSec: typeof vi.duration === 'number' ? Math.round(vi.duration) : undefined,
          derivative: Boolean(deriv),
        });
      }
      if (out.length === 0) setSearchError('لا توجد نتائج فيديو مناسبة — جرّب كلمات إنجليزية أخرى.');
      setClips(out.slice(0, 18));
    } catch {
      setSearchError('تعذر الوصول إلى ويكيميديا كومنز من هذا المتصفح. استخدم الاستيراد برابط مباشر أو الرفع من الجهاز.');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const importClip = useCallback(async (clip: CommonsClip, tags: string[]) => {
    setImportJobs((j) => ({ ...j, [clip.url]: { phase: 'downloading', pct: 0 } }));
    try {
      const buf = await fetchWithProgress(clip.url, (pct) => {
        setImportJobs((j) => ({ ...j, [clip.url]: { phase: 'downloading', pct } }));
      });
      setImportJobs((j) => ({ ...j, [clip.url]: { phase: 'uploading' } }));
      const name = clip.url.split('/').pop()?.split('?')[0] || 'clip.webm';
      const safeName = name.includes('.') ? name : `${name}.webm`;
      await uploadBinary('footage', safeName, buf, tags);
      setImportJobs((j) => ({ ...j, [clip.url]: { phase: 'done' } }));
      await refreshStatus();
    } catch (e) {
      setImportJobs((j) => ({ ...j, [clip.url]: { phase: 'error', message: e instanceof Error ? e.message : 'فشل الاستيراد' } }));
    }
  }, [uploadBinary, refreshStatus]);

  const importSelected = useCallback(async () => {
    const tags = query.toLowerCase().split(/[\s,]+/).filter((t) => t.length >= 3 && t !== 'filetype:video').slice(0, 8);
    for (const clip of clips) {
      if (selected[clip.url]) await importClip(clip, tags);
    }
  }, [clips, selected, query, importClip]);

  const importDirectUrl = useCallback(async () => {
    const url = directUrl.trim();
    if (!url) return;
    const tags = directTags.toLowerCase().split(/[\s,]+/).filter((t) => t.length >= 3).slice(0, 8);
    await importClip({ title: url.split('/').pop() ?? url, url, sizeMb: 0, derivative: false }, tags);
    setDirectUrl('');
  }, [directUrl, directTags, importClip]);

  const importDeviceFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const tags = deviceTags.toLowerCase().split(/[\s,]+/).filter((t) => t.length >= 3).slice(0, 8);
    for (const file of Array.from(files)) {
      setDeviceJob({ phase: 'uploading', message: file.name });
      try {
        const buf = await file.arrayBuffer();
        await uploadBinary('footage', file.name, buf, tags);
        setDeviceJob({ phase: 'done', message: file.name });
      } catch (e) {
        setDeviceJob({ phase: 'error', message: `${file.name}: ${e instanceof Error ? e.message : 'فشل الرفع'}` });
        return;
      }
    }
    await refreshStatus();
  }, [deviceTags, uploadBinary, refreshStatus]);

  const deleteFootage = useCallback(async (file: string) => {
    if (!token || !orgId) return;
    try {
      await fetch(`/api/v1/organizations/${orgId}/local-media/footage/${encodeURIComponent(file)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await refreshStatus();
    } catch { /* transient */ }
  }, [token, orgId, refreshStatus]);

  const hasVoice = useCallback((packId: string) => {
    if (!status) return false;
    const prefix = packId === 'ar-jo-kareem' ? 'ar_JO' : 'en_US';
    return status.voices.some((v) => v.file.startsWith(prefix) && v.file.endsWith('.onnx'));
  }, [status]);

  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);

  return (
    <div dir="rtl" className="studio-root">
      <div className="aurora a1" /><div className="aurora a2" /><div className="aurora a3" /><div className="grain" />
      <StudioNav />
      <main className="shell" style={{ maxWidth: 880, paddingTop: 42, paddingBottom: 80 }}>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="pill-note" style={{ marginBottom: 14 }}><Wand2 size={14} /> إنتاج واقعي بدون إنترنت على الخادم</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em' }}>مكتبة الأصول الواقعية</h1>
          <p className="muted" style={{ marginTop: 8, lineHeight: 1.9 }}>
            متصفحك متصل بالإنترنت بينما خادم التوليد يعمل بلا اتصال. هذه الصفحة تجلب الأصول من الإنترنت عبر متصفحك
            وتحفظها في الخادم: بعد الاستيراد يستخدم التوليد الصوت العصبي للتعليق ولقطات فيديو حقيقية لمشاهد الفيديو تلقائيًا.
          </p>
        </motion.div>

        {sessionError && (
          <div className="glass" style={{ padding: 18, marginTop: 22, borderColor: 'rgba(255,93,158,.4)' }}>
            <p style={{ color: '#ffd5e5' }}>{sessionError}</p>
          </div>
        )}

        {/* ── neural voices ── */}
        <section className="glass" style={{ padding: 24, marginTop: 26 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><AudioLines size={18} /> الأصوات العصبية المحلية</h2>
          <p className="sm muted" style={{ marginTop: 6 }}>حزم Piper العصبية — بعد التثبيت يُستخدم الصوت تلقائيًا في كل فيديو بنفس اللغة.</p>
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            {VOICE_PACKS.map((pack) => {
              const job = voiceJobs[pack.id] ?? { phase: 'idle' as const };
              const installed = hasVoice(pack.id);
              return (
                <div key={pack.id} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', border: '1px solid #262629', borderRadius: 14, padding: '12px 14px' }}>
                  <div style={{ flex: '1 1 240px' }}>
                    <strong style={{ fontSize: 14 }}>{pack.label}</strong>
                    <p className="sm muted" style={{ marginTop: 3 }}>{pack.note}</p>
                    {job.phase === 'downloading' && <p className="sm" style={{ marginTop: 6, color: '#eaffc7' }}>⬇ {job.message} — {job.pct ?? 0}%</p>}
                    {job.phase === 'uploading' && <p className="sm" style={{ marginTop: 6, color: '#eaffc7' }}>⬆ جاري الحفظ في الخادم — {job.message}</p>}
                    {job.phase === 'error' && <p className="sm" style={{ marginTop: 6, color: '#ffd5e5' }}>✖ {job.message}</p>}
                  </div>
                  {job.phase === 'done' || installed
                    ? <span className="pill-note" style={{ background: 'rgba(61,255,192,.16)', color: '#bfffe9' }}><Check size={14} /> {job.phase === 'done' ? 'تم التثبيت' : 'مثبت'}</span>
                    : <button type="button" className="hf-generate" disabled={job.phase === 'downloading' || job.phase === 'uploading' || !session} onClick={() => void installVoicePack(pack)} style={{ fontSize: 13 }}>
                      {job.phase === 'downloading' || job.phase === 'uploading' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CloudDownload size={14} />} تثبيت الصوت
                    </button>}
                </div>
              );
            })}
          </div>
          {status && status.voices.length > 0 && (
            <p className="sm muted" style={{ marginTop: 12 }}>ملفات الأصوات في الخادم: {status.voices.map((v) => v.file).join(' · ')}</p>
          )}
        </section>

        {/* ── commons footage ── */}
        <section className="glass" style={{ padding: 24, marginTop: 20 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><Film size={18} /> لقطات فيديو حقيقية (ويكيميديا كومنز)</h2>
          <p className="sm muted" style={{ marginTop: 6 }}>ابحث بكلمات إنجليزية (space, forest, city night…) واختر لقطات حقيقية مجانية الاستخدام تُطابق موضوع فيديوهاتك.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void searchCommons(); }}
              placeholder="space nebula stars"
              style={{ flex: '1 1 240px', background: '#0e0e10', border: '1px solid #262629', borderRadius: 12, padding: '10px 14px', color: 'inherit', fontSize: 14 }}
            />
            <button type="button" className="hf-generate" disabled={searching || !session} onClick={() => void searchCommons()} style={{ fontSize: 13 }}>
              {searching ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />} بحث
            </button>
          </div>
          {searchError && <p className="sm" style={{ marginTop: 10, color: '#ffd5e5' }}>{searchError}</p>}
          {clips.length > 0 && (
            <>
              <div style={{ display: 'grid', gap: 8, marginTop: 14, maxHeight: 340, overflowY: 'auto', paddingLeft: 4 }}>
                {clips.map((clip) => {
                  const job = importJobs[clip.url];
                  return (
                    <label key={clip.url} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #262629', borderRadius: 12, padding: '10px 12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={Boolean(selected[clip.url])} onChange={(e) => setSelected((s) => ({ ...s, [clip.url]: e.target.checked }))} disabled={job?.phase === 'downloading' || job?.phase === 'uploading'} />
                      <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={clip.title}>{clip.title}</span>
                      <span className="sm muted">{clip.durationSec ? `${clip.durationSec}s · ` : ''}{clip.derivative ? '≤720p' : `${clip.sizeMb.toFixed(1)}MB`}</span>
                      {job?.phase === 'downloading' && <span className="sm" style={{ color: '#eaffc7' }}>⬇ {job.pct ?? 0}%</span>}
                      {job?.phase === 'uploading' && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                      {job?.phase === 'done' && <Check size={14} color="#3dffc0" />}
                      {job?.phase === 'error' && <span className="sm" style={{ color: '#ffd5e5' }} title={job.message}>✖</span>}
                    </label>
                  );
                })}
              </div>
              <button type="button" className="hf-generate" disabled={selectedCount === 0 || !session} onClick={() => void importSelected()} style={{ marginTop: 12, fontSize: 13 }}>
                <UploadCloud size={14} /> استيراد المحدد ({selectedCount})
              </button>
            </>
          )}
        </section>

        {/* ── direct url + device upload ── */}
        <section className="glass" style={{ padding: 24, marginTop: 20 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><Link2 size={18} /> استيراد برابط مباشر</h2>
          <p className="sm muted" style={{ marginTop: 6 }}>ألصق رابط أي مقطع mp4/webm (Pexels، Coverr، موقعك…) مع وسوم الموضوع.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <input value={directUrl} onChange={(e) => setDirectUrl(e.target.value)} placeholder="https://example.com/clip.mp4" dir="ltr" style={{ flex: '2 1 260px', background: '#0e0e10', border: '1px solid #262629', borderRadius: 12, padding: '10px 14px', color: 'inherit', fontSize: 13 }} />
            <input value={directTags} onChange={(e) => setDirectTags(e.target.value)} placeholder="وسوم: space, galaxy" style={{ flex: '1 1 160px', background: '#0e0e10', border: '1px solid #262629', borderRadius: 12, padding: '10px 14px', color: 'inherit', fontSize: 13 }} />
            <button type="button" className="hf-generate" disabled={!directUrl.trim() || !session} onClick={() => void importDirectUrl()} style={{ fontSize: 13 }}>
              {importJobs[directUrl]?.phase === 'downloading' || importJobs[directUrl]?.phase === 'uploading' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CloudDownload size={14} />} استيراد
            </button>
          </div>

          <h2 style={{ fontSize: 19, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, marginTop: 26 }}><HardDriveDownload size={18} /> رفع من الجهاز</h2>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,.mkv,.m4v" multiple hidden onChange={(e) => void importDeviceFiles(e.target.files)} />
            <input value={deviceTags} onChange={(e) => setDeviceTags(e.target.value)} placeholder="وسوم الموضوع: nature, river" style={{ flex: '1 1 200px', background: '#0e0e10', border: '1px solid #262629', borderRadius: 12, padding: '10px 14px', color: 'inherit', fontSize: 13 }} />
            <button type="button" className="hf-generate" disabled={!session} onClick={() => fileInputRef.current?.click()} style={{ fontSize: 13 }}>
              {deviceJob.phase === 'uploading' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <UploadCloud size={14} />} اختيار ملفات
            </button>
          </div>
          {deviceJob.phase !== 'idle' && <p className="sm" style={{ marginTop: 8, color: deviceJob.phase === 'error' ? '#ffd5e5' : '#eaffc7' }}>{deviceJob.phase === 'done' ? '✓ ' : ''}{deviceJob.message}</p>}
        </section>

        {/* ── library status ── */}
        <section className="glass" style={{ padding: 24, marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 19, fontWeight: 800, flex: 1 }}>مكتبة الخادم الحالية</h2>
            <button type="button" className="chip" onClick={() => void refreshStatus()}><RefreshCw size={13} /> تحديث</button>
          </div>
          {!status ? (
            <p className="sm muted" style={{ marginTop: 10 }}>{session ? 'جاري القراءة…' : 'بانتظار الجلسة…'}</p>
          ) : (
            <>
              <p className="sm muted" style={{ marginTop: 10 }}>
                الوضع: {status.localGeneration ? 'التوليد المحلي مفعّل ✓' : 'التوليد المحلي غير مفعّل (ACA_LOCAL_GENERATION)'} ·
                أصوات: {status.voices.filter((v) => v.neural).length} عصبي · لقطات: {status.footage.length}
              </p>
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {status.footage.map((f) => (
                  <div key={f.file} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #262629', borderRadius: 12, padding: '9px 12px' }}>
                    <Film size={14} />
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.file}>{f.file}</span>
                    <span className="sm muted">{(f.durationMs / 1000).toFixed(0)}s</span>
                    <span className="sm muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.tags.join(', ')}</span>
                    <button type="button" className="chip" onClick={() => void deleteFootage(f.file)} aria-label="حذف"><Trash2 size={13} /></button>
                  </div>
                ))}
                {status.footage.length === 0 && <p className="sm muted">لا لقطات بعد — استورد لقطات لتصبح مشاهد الفيديو واقعية.</p>}
              </div>
            </>
          )}
          <p className="sm muted" style={{ marginTop: 16 }}>
            بعد الاستيراد اذهب إلى <Link href="/video" style={{ color: '#d4ff32' }}>إنشاء فيديو</Link> وستُستخدم هذه الأصول تلقائيًا حسب موضوع الفيديو.
          </p>
        </section>
      </main>
    </div>
  );
}

export default function AssetsPage() {
  return <Suspense fallback={null}><AssetsInner /></Suspense>;
}
