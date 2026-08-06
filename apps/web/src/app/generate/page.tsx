'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { loadDraft } from '../../lib/create';
import { loadStudioSession, tryRefreshToken } from '../../lib/studio-session';
import { submitGeneration, pollVideo, requeueVideo, friendlyStatus } from '../../lib/studio-flow';

type Phase = 'guard' | 'processing' | 'completed';

function GenerateInner() {
  const router = useRouter();
  const [draft] = useState(() => loadDraft());
  const session = useMemo(() => loadStudioSession(), []);
  const [phase, setPhase] = useState<Phase>('guard');
  const [status, setStatus] = useState('QUEUED');
  const startedRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!session) { router.replace('/signup?next=/generate'); return; }
    if (!session.plan) { router.replace('/subscribe?next=/generate'); return; }
    if (!draft.prompt) { router.replace('/create'); return; }

    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      await tryRefreshToken();
      const cur = loadStudioSession() ?? session;
      setPhase('processing');

      while (!cancelledRef.current) {
        // 1) Submit (or re-submit) the job.
        const res = await submitGeneration(cur, draft.prompt, Math.max(20, draft.duration));
        if (cancelledRef.current) return;
        if (res.kind === 'error') {
          router.replace('/login?next=/generate'); // session issue
          return;
        }
        if (res.kind === 'retry') {
          setStatus('retrying');
          await new Promise((r) => setTimeout(r, 2500)); // auto-retry
          continue;
        }

        const job = res.job;
        setStatus('QUEUED');
        const outcome = await pollVideo(cur.tokens!.accessToken, job.orgId, job.videoId, (st) => setStatus(st));

        if (cancelledRef.current) return;
        if (outcome === 'completed') {
          setPhase('completed');
          window.setTimeout(() => {
            router.push(`/result?mode=api&videoId=${job.videoId}&orgId=${job.orgId}&w=${1280}&h=${720}&sec=${draft.duration}&model=${draft.model}`);
          }, 800);
          return;
        }
        if (outcome === 'session') {
          router.replace('/login?next=/generate');
          return;
        }
        // processing → provider hiccup / network → auto-re-enqueue and loop.
        await requeueVideo(cur, job.orgId, job.videoId);
        setStatus('retrying');
        await new Promise((r) => setTimeout(r, 2000));
      }
    })().catch(() => setStatus('retrying'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, draft]);

  const label = phase === 'completed' ? 'Completed' : friendlyStatus(status);

  if (phase === 'guard') {
    return (
      <div dir="ltr" className="studio-root"><div className="aurora a1" /><div className="grain" /><StudioNav minimal />
        <main className="shell" style={{ paddingTop: 60 }}><div className="loader-cards"><div className="skel" style={{ height: 260 }} /><div className="skel" style={{ height: 260 }} /><div className="skel" style={{ height: 260 }} /></div></main>
      </div>
    );
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" /><div className="aurora a2" /><div className="aurora a3" /><div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ maxWidth: 720, paddingTop: 48 }}>
        <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} className="glass" style={{ padding: 30, textAlign: 'center' }}>
          {phase === 'completed' ? (
            <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="pill-note" style={{ margin: '0 auto', background: 'rgba(61,255,192,0.16)', color: '#bfffe9' }}>
              <Check size={18} /> Completed
            </motion.div>
          ) : (
            <div className="spinner magenta" style={{ margin: '0 auto' }} />
          )}
          <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 20 }}>{label}</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {label === 'Completed'
              ? 'Your video is ready.'
              : label === 'Preparing'
                ? 'Getting everything ready…'
                : label === 'Rendering'
                  ? 'Your video is being rendered on the studio pipeline.'
                  : 'Your request is being processed. This may take a moment — we will continue automatically.'}
          </p>
          <div className="bar" style={{ marginTop: 24, maxWidth: 420, marginInline: 'auto' }}>
            <div className="fill" style={{ width: phase === 'completed' ? '100%' : label === 'Rendering' ? '72%' : '46%' }} />
          </div>
          <p className="sm muted" style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {phase !== 'completed' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {phase === 'completed' ? 'Opening your video…' : 'We will keep working until it is done.'}
          </p>
        </motion.div>
      </main>
    </div>
  );
}

export default function GeneratePage() {
  return <Suspense fallback={null}><GenerateInner /></Suspense>;
}
