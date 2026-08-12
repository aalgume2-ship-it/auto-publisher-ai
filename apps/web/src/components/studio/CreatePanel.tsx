'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ImagePlus, Sparkles, Upload, Video, Wand2, X, Zap } from 'lucide-react';
import { MODELS, ASPECTS, DURATIONS, STYLES, type CreateDraft } from '../../lib/create';

type MediaItem = { id: string; name: string; url: string; type: 'image' | 'video' };

export default function CreatePanel({ initial, onGenerate, busy = false }: { initial: CreateDraft; onGenerate: (d: CreateDraft) => void; busy?: boolean }) {
  const [prompt, setPrompt] = useState(initial.prompt);
  const [model, setModel] = useState(initial.model);
  const [style, setStyle] = useState(initial.style);
  const [aspect, setAspect] = useState(initial.aspect);
  const [duration, setDuration] = useState(initial.duration);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canGo = prompt.trim().length > 2 || media.length > 0;

  function addFiles(files: FileList | File[]) {
    const next = Array.from(files).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/')).slice(0, 12 - media.length);
    setMedia((current) => [...current, ...next.map((f) => ({ id: `${f.name}-${f.lastModified}-${Math.random()}`, name: f.name, url: URL.createObjectURL(f), type: f.type.startsWith('video/') ? 'video' : 'image' }))]);
  }
  function remove(id: string) { setMedia((items) => { const item = items.find((x) => x.id === id); if (item) URL.revokeObjectURL(item.url); return items.filter((x) => x.id !== id); }); }
  function go() { if (!canGo || busy) return; onGenerate({ prompt: prompt.trim() || 'Create a cinematic video from the uploaded media.', model, style, aspect, duration }); }

  return (
    <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }} className="hf-create">
      <section className="hf-prompt-card">
        <div className="hf-prompt-head"><span className="hf-dot" /> <span>Create with AI</span><span className="hf-count">{prompt.length}/2000</span></div>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, 2000))} className="hf-prompt" placeholder="Describe the video you want to create…" />
        <div className="hf-prompt-bottom">
          <div className="hf-actions">
            <button type="button" className="hf-tool" onClick={() => inputRef.current?.click()}><Upload size={16} /> Add media</button>
            <button type="button" className="hf-tool" onClick={() => setPrompt((p) => p ? `${p}, cinematic camera movement, realistic lighting, premium commercial look` : 'A premium cinematic commercial, elegant product reveal, realistic lighting')}><Wand2 size={16} /> Enhance</button>
            <button type="button" className="hf-tool" onClick={() => setPrompt('A cinematic product commercial with dramatic camera movement, beautiful lighting, premium detail')}><Sparkles size={16} /> Inspire</button>
          </div>
          <button type="button" className="hf-generate" disabled={!canGo || busy} onClick={go}>{busy ? 'Generating…' : 'Generate'} <Zap size={17} /></button>
        </div>
        <input ref={inputRef} hidden type="file" accept="image/*,video/*" multiple onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = ''; }} />
      </section>

      <section className={`hf-drop ${drag ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }} onClick={() => inputRef.current?.click()}>
        <div className="hf-drop-icon"><ImagePlus size={22} /></div>
        <div><strong>Drop images or videos here</strong><p>Use one or multiple references to guide the generation</p></div>
        <span className="hf-browse">Browse</span>
      </section>

      {media.length > 0 && <section className="hf-media-grid">{media.map((m) => <div className="hf-media" key={m.id}>{m.type === 'image' ? <img src={m.url} alt={m.name} /> : <video src={m.url} muted />}{m.type === 'video' && <span className="hf-video-icon"><Video size={13} /></span>}<button type="button" onClick={(e) => { e.stopPropagation(); remove(m.id); }}><X size={14} /></button></div>)}</section>}

      <section className="hf-settings">
        <div className="hf-setting"><label>Model</label><div className="hf-options">{MODELS.map((m) => <button key={m.id} type="button" className={model === m.id ? 'active' : ''} onClick={() => setModel(m.id)}><b>{m.name}</b><small>{m.tag}</small></button>)}</div></div>
        <div className="hf-setting"><label>Aspect ratio</label><div className="hf-options compact">{ASPECTS.map((a) => <button key={a.id} type="button" className={aspect === a.id ? 'active' : ''} onClick={() => setAspect(a.id)}>{a.id}<small>{a.hint}</small></button>)}</div></div>
        <div className="hf-setting"><label>Duration</label><div className="hf-options compact">{DURATIONS.map((d) => <button key={d} type="button" className={duration === d ? 'active' : ''} onClick={() => setDuration(d)}>{d}s</button>)}</div></div>
      </section>

      <section className="hf-styles"><div className="hf-section-title">Style</div><div className="hf-style-row">{STYLES.map((s) => <button key={s.id} type="button" className={style === s.id ? 'active' : ''} onClick={() => setStyle(s.id)}><span style={{ background: `linear-gradient(135deg, ${s.from}, ${s.to})` }} /><b>{s.name}</b></button>)}</div></section>
    </motion.div>
  );
}
