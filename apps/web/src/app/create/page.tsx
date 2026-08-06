'use client';

import { useRouter } from 'next/navigation';
import StudioNav from '../../components/studio/StudioNav';
import CreatePanel from '../../components/studio/CreatePanel';
import { loadDraft, saveDraft, type CreateDraft } from '../../lib/create';

export default function CreatePage() {
  const router = useRouter();
  function handleGenerate(d: CreateDraft) {
    saveDraft(d);
    router.push('/generate');
  }
  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" /><div className="aurora a2" /><div className="aurora a3" /><div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ paddingTop: 20 }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <h1 style={{ fontSize: 34, fontWeight: 800 }}>Create a video</h1>
          <p className="muted">Describe your scene, tune the settings, generate.</p>
        </div>
        <CreatePanel initial={loadDraft()} onGenerate={handleGenerate} />
      </main>
    </div>
  );
}
