'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { loadDraft } from '../../lib/create';
import { ensureGuestSession, loadStudioSession, tryRefreshToken } from '../../lib/studio-session';
import { submitGeneration, pollVideo, requeueVideo, friendlyStatus } from '../../lib/studio-flow';

type Phase = 'booting' | 'processing' | 'completed';

function GenerateInner() {
  const router = useRouter();
  const [draft] = useState(() => loadDraft());
  const initialSession = useMemo(() => loadStudioSession(), []);
  const [phase, setPhase] = useState<Phase>('booting');
  const [status, setStatus] = useState('QUEUED');
  const startedRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!draft.prompt) { router.replace('/create'); return; }
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      // Testing mode: provision a short-lived anonymous workspace in the real API.
      // The user never sees a login/signup/payment screen.
      const session = initialSession?.tokens?.accessToken && initialSession.plan
        ? initialSession
        : await ensureGuestSession();
      if (!session) {
        setStatus('retrying');
        setPhase('processing');
        return;
      }

      await tryRefreshToken();
      const cur = loadStudioSession() ?? session;
      setPhase('processing');

      while (!cancelledRef.current) {
        const res = await submitGeneration(cur, draft.prompt, Math.max(20, draft.duration));
        if (cancelledRef.current) return;
        if (res.kind === 'error') {
          setStatus('retrying');
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }
        if (res.kind === 'retry') {
          setStatus('retrying');
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }

        const job = res.job;
        setStatus('QUEUED');
        const outcome = await pollVideo(cur.tokens!.accessToken, job.orgId, job.videoId, (st) => setStatus(st), 15 * 60_000);

        if (cancelledRef.current) return;
        if (outcome === 'completed') {
          setPhase('completed');
          window.setTimeout(() => {
            router.push(`/result?mode=api&videoId=${job.videoId}&orgId=${job.orgId}&w=${1280}&h=${720}&sec=${draft.duration}&model=${draft.model}`);
          }, 800);
          return;
        }
        await requeueVideo(cur, job.orgId, job.videoId);
        setStatus('retrying');
        await new Promise((r) => setTimeout(r, 2000));
      }
    })().catch(() => {
      setPhase('processing');
      setStatus('retrying');
    });
    return () => { cancelledRef.current = true; };
  }, [initialSession, draft, router]);

  const label = phase === 'completed' ? 'Completed' : friendlyStatus(status);

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
          <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 20 }}>{phase === 'booting' ? 'Preparing Studio' : label}</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {phase === 'completed'
              ? 'Your video is ready.'
              : phase === 'booting'
                ? 'Preparing a temporary testing workspace…'
                : label === 'Preparing'
                  ? 'Getting everything ready…'
                  : label === 'Rendering'
                    ? 'Your video is being rendered on the studio pipeline.'
                    : 'Your request is being processed. We will keep working automatically.'}
          </p>
          <div className="bar" style={{ marginTop: 24, maxWidth: 420, marginInline: 'auto' }}>
            <div className="fill" style={{ width: phase === 'completed' ? '100%' : label === 'Rendering' ? '72%' : '46%' }} />
          </div>
          <p className="sm muted" style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {phase !== 'completed' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {phase === 'completed' ? 'Opening your video…' : 'No login or subscription is required in testing mode.'}
          </p>
        </motion.div>
      </main>
    </div>
  );
}

export default function GeneratePage() {
  return <Suspense fallback={null}><GenerateInner /></Suspense>;
}
