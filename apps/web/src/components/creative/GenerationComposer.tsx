'use client';
import { useRouter } from 'next/navigation';
import CreatePanel from '../studio/CreatePanel';
import { loadDraft, saveDraft, type CreateDraft } from '../../lib/create';
export function GenerationComposer(){const router=useRouter();function generate(d:CreateDraft){saveDraft(d);router.push('/generate')}return <div className="cp-composer-wrap"><CreatePanel initial={loadDraft()} onGenerate={generate}/></div>}
