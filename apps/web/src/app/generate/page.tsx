'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { loadDraft } from '../../lib/create';
import { ensureGuestSession, loadStudioSession, tryRefreshToken } from '../../lib/studio-session';
import { submitGeneration, pollVideo, requeueVideo, friendlyStatus } from '../../lib/studio-flow';

type Phase = 'booting' | 'processing' | 'completed' | 'failed';

function GenerateInner() {
  const router = useRouter();
  const [draft] = useState(() => loadDraft());
  const initialSession = useMemo(() => loadStudioSession(), []);
  const [phase, setPhase] = useState<Phase>('booting');
  const [status, setStatus] = useState('QUEUED');
  const [error, setError] = useState('');
  const startedRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!draft.prompt) { router.replace('/create'); return; }
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const session = initialSession?.tokens?.accessToken && initialSession.plan ? initialSession : await ensureGuestSession();
      if (!session) { setError('لم نستطع الاتصال بخدمة التوليد. تأكد أن الـ API والـ Worker يعملان.'); setPhase('failed'); return; }
      await tryRefreshToken();
      const cur = loadStudioSession() ?? session;
      setPhase('processing');

      const res = await submitGeneration(cur, draft.prompt, Math.min(60, Math.max(20, draft.duration)));
      if (cancelledRef.current) return;
      if (res.kind === 'error') { setError(res.message); setPhase('failed'); return; }
      if (res.kind === 'retry') { setError('خدمة التوليد غير متاحة حاليًا. الـ API أو الـ Worker يحتاج إلى التشغيل.'); setPhase('failed'); return; }

      const job = res.job;
      setStatus('QUEUED');
      const outcome = await pollVideo(cur.tokens!.accessToken, job.orgId, job.videoId, (st) => setStatus(st), 15 * 60_000);
      if (cancelledRef.current) return;
      if (outcome === 'completed') {
        setPhase('completed');
        window.setTimeout(() => router.push(`/result?mode=api&videoId=${job.videoId}&orgId=${job.orgId}&w=1280&h=720&sec=${job.targetSeconds}&model=${draft.model}`), 800);
        return;
      }
      if (outcome === 'session') { setError('انتهت جلسة الاختبار. أعد تحميل الصفحة.'); setPhase('failed'); return; }
      if (outcome === 'failed') { setError('محرك التوليد فشل في إنشاء الفيديو. أعد المحاولة بعد التأكد من مزود الذكاء الاصطناعي والـ Worker.'); setPhase('failed'); return; }

      const requeued = await requeueVideo(cur, job.orgId, job.videoId);
      if (!requeued) { setError('انتهت مهلة التوليد ولم نتمكن من إعادة المهمة إلى الـ Worker.'); setPhase('failed'); return; }
      setError('استغرق التوليد وقتًا أطول من المتوقع. تمت إعادة المهمة إلى المحرك؛ اضغط إعادة المحاولة إذا لم يبدأ التوليد.');
      setPhase('failed');
    })().catch((e) => {
      setError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع أثناء التوليد.');
      setPhase('failed');
    });
    return () => { cancelledRef.current = true; };
  }, [initialSession, draft, router]);

  const label = phase === 'completed' ? 'Completed' : phase === 'failed' ? 'Generation failed' : friendlyStatus(status);

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" /><div className="aurora a2" /><div className="aurora a3" /><div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ maxWidth: 720, paddingTop: 48 }}>
        <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} className="glass" style={{ padding: 30, textAlign: 'center' }}>
          {phase === 'completed' ? <motion.div initial={{ scale: .7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="pill-note" style={{ margin: '0 auto', background: 'rgba(61,255,192,.16)', color: '#bfffe9' }}><Check size={18} /> Completed</motion.div> : phase === 'failed' ? <div className="pill-note" style={{ margin: '0 auto', background: 'rgba(255,93,158,.14)', color: '#ffd5e5' }}>Generation failed</div> : <div className="spinner magenta" style={{ margin: '0 auto' }} />}
          <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 20 }}>{phase === 'booting' ? 'Preparing Studio' : label}</h1>
          <p className="muted" style={{ marginTop: 8 }}>{phase === 'completed' ? 'Your video is ready.' : phase === 'failed' ? error : phase === 'booting' ? 'Preparing a temporary testing workspace…' : status === 'RENDERING' ? 'Your video is being rendered on the real pipeline.' : 'Your request is being processed by the real generation worker.'}</p>
          {phase === 'failed' && <button type="button" className="hf-generate" style={{ marginTop: 22 }} onClick={() => router.replace('/create')}><RotateCcw size={16} /> Back to Create</button>}
          <div className="bar" style={{ marginTop: 24, maxWidth: 420, marginInline: 'auto' }}><div className="fill" style={{ width: phase === 'completed' ? '100%' : phase === 'failed' ? '100%' : status === 'RENDERING' ? '72%' : '46%' }} /></div>
          <p className="sm muted" style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{phase !== 'completed' && phase !== 'failed' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}{phase === 'completed' ? 'Opening your video…' : phase === 'failed' ? 'No automatic retry loop — the actual failure is shown.' : 'No login or subscription is required in testing mode.'}</p>
        </motion.div>
      </main>
    </div>
  );
}

export default function GeneratePage() { return <Suspense fallback={null}><GenerateInner /></Suspense>; }
