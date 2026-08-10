'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StudioNav from '../../components/studio/StudioNav';
import CreatePanel from '../../components/studio/CreatePanel';
import ReferenceImages from '../../components/studio/ReferenceImages';
import AdvancedSettings from '../../components/studio/AdvancedSettings';
import { loadDraft, saveDraft, type CreateDraft } from '../../lib/create';

const STORAGE_KEY = 'aca.last-prompt.v1';

export default function CreatePage() {
  const router = useRouter();
  const [draft, setDraft] = useState<CreateDraft>(() => loadDraft());
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [useLastPrompt, setUseLastPrompt] = useState(false);

  // Load any saved "last prompt" to allow the user to continue.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw && !draft.prompt) {
        setUseLastPrompt(true);
      }
    } catch {
      /* ignore */
    }
  }, [draft.prompt]);

  function handleGenerate(d: CreateDraft) {
    const finalDraft: CreateDraft = {
      ...d,
      prompt: useLastPrompt && d.prompt.trim().length === 0
        ? window.localStorage.getItem(STORAGE_KEY) ?? d.prompt
        : d.prompt,
    };
    saveDraft(finalDraft);
    try {
      window.localStorage.setItem(STORAGE_KEY, finalDraft.prompt);
    } catch {
      /* ignore */
    }
    router.push('/generate');
  }

  function applyLastPrompt() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setDraft({ ...draft, prompt: raw });
        setUseLastPrompt(false);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="aurora a3" />
      <div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ paddingTop: 20 }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <h1 style={{ fontSize: 34, fontWeight: 800 }}>Create Studio</h1>
          <p className="muted">Describe the scene, attach references, and pick a model.</p>
        </div>

        {useLastPrompt && (
          <div
            className="glass"
            style={{
              padding: 14,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div className="sm">
              You have a previous prompt saved. <button className="btn btn-ghost" onClick={applyLastPrompt} style={{ marginLeft: 8 }}>Use it</button>
            </div>
            <button
              className="btn btn-ghost sm"
              onClick={() => setUseLastPrompt(false)}
              style={{ fontSize: 12 }}
            >
              Dismiss
            </button>
          </div>
        )}

        <CreatePanel initial={draft} onGenerate={handleGenerate} />
        <div style={{ marginTop: 16 }}>
          <ReferenceImages images={referenceImages} onChange={setReferenceImages} />
        </div>
        <div style={{ marginTop: 16 }}>
          <AdvancedSettings draft={draft} onChange={setDraft} />
        </div>
      </main>
    </div>
  );
}
