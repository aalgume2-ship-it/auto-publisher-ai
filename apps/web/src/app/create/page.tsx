'use client';
import './create-hf.css';
import { useRouter } from 'next/navigation';
import StudioNav from '../../components/studio/StudioNav';
import CreatePanel from '../../components/studio/CreatePanel';
import { loadDraft, saveDraft, type CreateDraft } from '../../lib/create';

export default function CreatePage() {
  const router = useRouter();
  function handleGenerate(d: CreateDraft) { saveDraft(d); router.push('/generate'); }
  return (
    <div dir="ltr" className="studio-root" style={{ background: '#070708', minHeight: '100vh' }}>
      <StudioNav minimal />
      <main style={{ position: 'relative', zIndex: 1, width: 'min(calc(100% - 32px), 1120px)', margin: '0 auto', paddingTop: 34 }}>
        <div style={{ marginBottom: 26 }}>
          <div style={{ color: '#d4ff32', fontSize: 12, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>AI Video Studio</div>
          <h1 style={{ color: '#f4f4f5', fontSize: 'clamp(30px,5vw,48px)', lineHeight: 1.05, fontWeight: 800, marginTop: 8 }}>What do you want to create?</h1>
          <p style={{ color: '#71717a', marginTop: 9 }}>Describe your idea or start with images and videos.</p>
        </div>
        <CreatePanel initial={loadDraft()} onGenerate={handleGenerate} />
      </main>
    </div>
  );
}
