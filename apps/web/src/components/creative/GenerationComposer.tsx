'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import CreatePanel from '../studio/CreatePanel';
import { loadDraft, saveDraft, type CreateDraft } from '../../lib/create';

export function GenerationComposer(){
  const router=useRouter();
  const initial=useMemo<CreateDraft>(()=>{
    const base=loadDraft();
    if(typeof window==='undefined') return base;
    const qs=new URLSearchParams(window.location.search);
    const prompt=qs.get('prompt');
    const style=qs.get('style');
    const aspect=qs.get('aspect');
    return {
      ...base,
      ...(prompt?{prompt}:{}),
      ...(style?{style}:{}),
      ...(aspect?{aspect}:{}),
    };
  },[]);
  function generate(d:CreateDraft){saveDraft(d);router.push('/generate')}
  return <div className="cp-composer-wrap"><CreatePanel initial={initial} onGenerate={generate}/></div>
}
