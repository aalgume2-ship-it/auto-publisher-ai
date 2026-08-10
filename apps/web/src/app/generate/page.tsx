'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { AlertCircle, Check, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';
import { loadDraft } from '../../lib/create';
import { loadStudioSession } from '../../lib/studio-session';
import { submitGeneration, pollVideo, requeueVideo, friendlyStatus } from '../../lib/studio-flow';

type Phase = 'guard' | 'processing' | 'completed' | 'error' | 'not_configured';

function GenerateInner() {
  const router = useRouter();
  const [draft] = useState(() => loadDraft());
  const session = useMemo(() => loadStudioSession(), []);
  const [phase, setPhase] = useState<Phase>('guard');
  const [status, setStatus] = useState('QUEUED');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const startedRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!draft.prompt) {
      router.replace('/create');
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const cur = session ?? loadStudioSession();
      if (!cur) {
        router.replace('/create');
        return;
      }
      setPhase('processing');

      // Retry loop with bounded attempts — real provider calls only.
      const MAX_ATTEMPTS = 3;
      let attempt = 0;
      while (!cancelledRef.current && attempt < MAX_ATTEMPTS) {
        attempt++;
        setAttempts(attempt);
        const res = await submitGeneration(cur, draft.prompt, Math.max(6, draft.duration));
        if (cancelledRef.current) return;

        if (res.kind === 'not_configured') {
          setErrorMsg(res.detail);
          setPhase('not_configured');
          return;
        }
        if (res.kind === 'error') {
          setErrorMsg(res.message);
          setPhase('error');
          return;
        }
        if (res.kind === 'retry') {
          setStatus('RETRY');
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }

        const job = res.job;
        setStatus('QUEUED');
        const outcome = await pollVideo(
          cur,
          job.orgId,
          job.videoId,
          (st) => setStatus(st),
        );

        if (cancelledRef.current) return;
        if (outcome === 'completed') {
          setPhase('completed');
          window.setTimeout(() => {
            router.push(
              `/result?videoId=${job.videoId}&orgId=${job.orgId}&w=${1280}&h=${720}&sec=${draft.duration}&model=${draft.model}`,
            );
          }, 800);
          return;
        }
        if (outcome === 'not_configured') {
          setErrorMsg('API or video provider is not configured.');
          setPhase('not_configured');
          return;
        }
        if (outcome === 'session') {
          setErrorMsg('Your session has expired. Please sign in again.');
          setPhase('error');
          return;
        }
        if (outcome === 'failed') {
          setErrorMsg(`Generation failed (status: ${status}).`);
          setPhase('error');
          return;
        }

        // processing → auto-retry with requeue (exponential backoff).
        await requeueVideo(cur, job.orgId, job.videoId);
        setStatus('RETRY');
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
      if (!cancelledRef.current && phase !== 'completed') {
        setErrorMsg(`Generation did not finish after ${MAX_ATTEMPTS} attempts.`);
        setPhase('error');
      }
    })().catch((e) => {
      if (!cancelledRef.current) {
        setErrorMsg((e as Error).message);
        setPhase('error');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, draft]);

  const label = phase === 'completed' ? 'Completed' : friendlyStatus(status);

  if (phase === 'guard') {
    return (
      <div dir="ltr" className="studio-root">
        <div className="aurora a1" />
        <div className="grain" />
        <StudioNav minimal />
        <main className="shell" style={{ paddingTop: 60 }}>
          <div className="loader-cards">
            <div className="skel" style={{ height: 260 }} />
            <div className="skel" style={{ height: 260 }} />
            <div className="skel" style={{ height: 260 }} />
          </div>
        </main>
      </div>
    );
  }

  if (phase === 'not_configured' || phase === 'error') {
    return (
      <div dir="ltr" className="studio-root">
        <div className="aurora a1" />
        <div className="aurora a2" />
        <div className="grain" />
        <StudioNav minimal />
        <main className="shell" style={{ maxWidth: 720, paddingTop: 48 }}>
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass"
            style={{ padding: 32, textAlign: 'center' }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'rgba(212,255,50,0.12)',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 16px',
              }}
            >
              <AlertCircle size={26} style={{ color: 'var(--accent-strong)' }} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>
              {phase === 'not_configured' ? 'Provider not configured' : 'Generation failed'}
            </h1>
            <p className="muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
              {errorMsg}
            </p>
            <div className="row" style={{ marginTop: 24, justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => router.push('/create')}>
                <Sparkles size={16} /> Try a new prompt
              </button>
              <a className="btn btn-ghost" href="/api/v1/health/providers" target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Check provider status
              </a>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="aurora a3" />
      <div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ maxWidth: 720, paddingTop: 48 }}>
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass"
          style={{ padding: 30, textAlign: 'center' }}
        >
          {phase === 'completed' ? (
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="pill-note"
              style={{
                margin: '0 auto',
                background: 'rgba(61,255,192,0.16)',
                color: '#bfffe9',
              }}
            >
              <Check size={18} /> Completed
            </motion.div>
          ) : (
            <div className="spinner magenta" style={{ margin: '0 auto' }} />
          )}
          <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 20 }}>{label}</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {phase === 'completed'
              ? 'Your video is ready.'
              : label === 'Preparing'
                ? 'Queued — preparing the scene…'
                : label === 'Generating'
                  ? 'Generating frames with the AI provider…'
                  : label === 'Rendering'
                    ? 'Rendering and encoding the final clip…'
                    : 'Connecting to the provider. This may take a moment…'}
          </p>
          <div className="bar" style={{ marginTop: 24, maxWidth: 420, marginInline: 'auto' }}>
            <div
              className="fill"
              style={{
                width:
                  phase === 'completed'
                    ? '100%'
                    : label === 'Rendering'
                      ? '72%'
                      : label === 'Generating'
                        ? '56%'
                        : '32%',
              }}
            />
          </div>
          <p
            className="sm muted"
            style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {phase !== 'completed' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {phase === 'completed'
              ? 'Opening your video…'
              : `Provider working… ${attempts > 1 ? `(attempt ${attempts})` : ''}`}
          </p>
        </motion.div>
      </main>
    </div>
  );
}

export default function GeneratePage() {
  return <Suspense fallback={null}><GenerateInner /></Suspense>;
}
