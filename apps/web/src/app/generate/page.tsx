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

const MODEL_DIRECTION: Record<string, string> = {
  'lumen-pro': 'photorealistic live-action cinema, real locations, physically plausible human motion',
  'human-presenter': 'photorealistic Arabic human presenter, same exact adult identity in every shot, natural speech gestures and facial micro-expressions, direct-to-camera framing',
  'story-3d': 'premium feature-film 3D animation, consistent character design and proportions, expressive but believable motion',
};

const STYLE_DIRECTION: Record<string, string> = {
  documentary: 'natural documentary photography, available daylight, authentic skin texture and pores, restrained color grade',
  commercial: 'luxury commercial cinematography, controlled highlights, polished production design, premium color grade',
  cinematic: 'ARRI Alexa 35 look, 35mm and 50mm lenses, cinematic depth of field, motivated camera movement',
  'arabic-drama': 'high-end contemporary Arabic television drama, authentic wardrobe and locations, warm cinematic grade',
  studio: 'professional broadcast studio lighting, clean key and soft fill, realistic lens rendering',
  'soft-daylight': 'soft natural daylight, realistic exposure, gentle contrast and lifelike colors',
};

function professionalPrompt(draft: ReturnType<typeof loadDraft>): string {
  return [
    draft.prompt,
    MODEL_DIRECTION[draft.model] ?? MODEL_DIRECTION['lumen-pro'],
    STYLE_DIRECTION[draft.style] ?? STYLE_DIRECTION.documentary,
    `${draft.aspect} vertical-first composition`,
    'one coherent story with direct continuity between shots',
    'stable face, stable body proportions, stable wardrobe and location',
    'physically correct hands and fingers, natural blinking, breathing and weight shifts',
    'realistic motion blur, camera parallax, shadows, reflections and environmental interaction',
    'no waxy skin, no beauty-filter face, no warped anatomy, no extra fingers, no morphing, no duplicate people, no flicker, no subtitles, no written text, no logo, no watermark',
  ].filter(Boolean).join('. ');
}

function GenerateInner() {
  const router = useRouter();
  const [draft] = useState(() => loadDraft());
  const initialSession = useMemo(() => loadStudioSession(), []);
  const [phase, setPhase] = useState<Phase>('booting');
  const [status, setStatus] = useState('QUEUED');
  const [progress, setProgress] = useState(2);
  const [step, setStep] = useState('Waiting for the generation worker');
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

      const res = await submitGeneration(cur, professionalPrompt(draft), Math.min(60, Math.max(20, draft.duration)));
      if (cancelledRef.current) return;
      if (res.kind === 'error') { setError(res.message); setPhase('failed'); return; }
      if (res.kind === 'retry') { setError('خدمة التوليد غير متاحة حاليًا. الـ API أو الـ Worker يحتاج إلى التشغيل.'); setPhase('failed'); return; }

      const job = res.job;
      setStatus('QUEUED');
      const outcome = await pollVideo(cur.tokens!.accessToken, job.orgId, job.videoId, (st, pct, currentStep) => {
        setStatus(st);
        if (typeof pct === 'number') setProgress(Math.max(0, Math.min(100, pct)));
        if (currentStep) setStep(currentStep);
      }, 15 * 60_000);
      if (cancelledRef.current) return;
      if (outcome.kind === 'completed') {
        setPhase('completed');
        window.setTimeout(() => router.push(`/result?mode=api&videoId=${job.videoId}&orgId=${job.orgId}&w=1280&h=720&sec=${job.targetSeconds}&model=${draft.model}`), 800);
        return;
      }
      if (outcome.kind === 'session') { setError('انتهت جلسة الاختبار. أعد تحميل الصفحة.'); setPhase('failed'); return; }
      if (outcome.kind === 'failed') { setError(outcome.message); setPhase('failed'); return; }

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
          <p className="muted" style={{ marginTop: 8 }}>{phase === 'completed' ? 'Your video is ready.' : phase === 'failed' ? error : phase === 'booting' ? 'Preparing a temporary testing workspace…' : step}</p>
          {phase === 'failed' && <button type="button" className="hf-generate" style={{ marginTop: 22 }} onClick={() => router.replace('/create')}><RotateCcw size={16} /> Back to Create</button>}
          <div className="bar" style={{ marginTop: 24, maxWidth: 420, marginInline: 'auto' }}><div className="fill" style={{ width: `${phase === 'completed' || phase === 'failed' ? 100 : progress}%` }} /></div>
          {phase === 'processing' && <p className="sm muted" style={{ marginTop: 8 }}>{progress}% · {friendlyStatus(status)}</p>}
          <p className="sm muted" style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{phase !== 'completed' && phase !== 'failed' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}{phase === 'completed' ? 'Opening your video…' : phase === 'failed' ? 'No automatic retry loop — the actual failure is shown.' : 'No login or subscription is required in testing mode.'}</p>
        </motion.div>
      </main>
    </div>
  );
}

export default function GeneratePage() { return <Suspense fallback={null}><GenerateInner /></Suspense>; }
