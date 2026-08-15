'use client';
import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CreatePanel from '../studio/CreatePanel';
import { loadDraft, saveDraft, type CreateDraft } from '../../lib/create';

export function GenerationComposer(){
  const router=useRouter();
  const searchParams=useSearchParams();
  const queryKey=searchParams.toString();
  const initial=useMemo<CreateDraft>(()=>{
    const base=loadDraft();
    const prompt=searchParams.get('prompt');
    const style=searchParams.get('style');
    const aspect=searchParams.get('aspect');
    return {
      ...base,
      ...(prompt?{prompt}:{}),
      ...(style?{style}:{}),
      ...(aspect?{aspect}:{}),
    };
  },[searchParams,queryKey]);
  function generate(d:CreateDraft){saveDraft(d);router.push('/generate')}
  return <div className="cp-composer-wrap"><CreatePanel key={queryKey || 'default'} initial={initial} onGenerate={generate}/></div>
}
