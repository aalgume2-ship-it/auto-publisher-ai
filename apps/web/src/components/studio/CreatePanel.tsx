'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Wand2, Zap } from 'lucide-react';
import { MODELS, ASPECTS, DURATIONS, STYLES, type CreateDraft } from '../../lib/create';

export default function CreatePanel({
  initial,
  onGenerate,
  busy = false,
}: {
  initial: CreateDraft;
  onGenerate: (d: CreateDraft) => void;
  busy?: boolean;
}) {
  const [prompt, setPrompt] = useState(initial.prompt);
  const [model, setModel] = useState(initial.model);
  const [style, setStyle] = useState(initial.style);
  const [aspect, setAspect] = useState(initial.aspect);
  const [duration, setDuration] = useState(initial.duration);

  const canGo = prompt.trim().length > 2;

  function go() {
    if (!canGo) return;
    onGenerate({ prompt: prompt.trim(), model, style, aspect, duration });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="studio glass"
      id="studio"
    >
      <div className="prompt-box">
        <textarea
          className="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the scene you want to bring to life… a cinematic neon city at dusk, slow camera drift through rain, volumetric light…"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go(); }}
        />
        <div className="prompt-tools">
          <button type="button" className="chip" onClick={() => setPrompt((p) => (p ? p + ', dramatic rim lighting, shallow depth of field' : 'Cinematic establishing shot, dramatic rim lighting, shallow depth of field'))}>
            <Wand2 size={13} /> Enhance
          </button>
          <button type="button" className="chip" onClick={() => setPrompt('A lone astronaut walking across a bioluminescent alien forest, floating spores, soft fog, cinematic 35mm')}>
            <Sparkles size={13} /> Surprise me
          </button>
          <span className="chip" style={{ pointerEvents: 'none' }}>{prompt.trim().length} chars</span>
        </div>
      </div>

      <div className="rail" style={{ marginTop: 16 }}>
        <div className="field">
          <span className="label">Model</span>
          <div className="opt-row">
            {MODELS.map((m) => (
              <button key={m.id} type="button" className={`opt ${model === m.id ? 'on' : ''}`} onClick={() => setModel(m.id)}>
                <span className="glyph">◈</span>
                {m.name}
                <small>{m.desc}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Aspect ratio</span>
          <div className="opt-row">
            {ASPECTS.map((a) => (
              <button key={a.id} type="button" className={`opt ${aspect === a.id ? 'on' : ''}`} onClick={() => setAspect(a.id)}>
                {a.id}
                <small>{a.hint}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Duration</span>
          <div className="opt-row">
            {DURATIONS.map((d) => (
              <button key={d} type="button" className={`opt ${duration === d ? 'on' : ''}`} onClick={() => setDuration(d)}>
                {d}s
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Style</span>
          <div className="style-grid">
            {STYLES.map((s) => (
              <button key={s.id} type="button" className={`style-card ${style === s.id ? 'on' : ''}`} onClick={() => setStyle(s.id)}>
                <span className="swatch" style={{ background: `linear-gradient(120deg, ${s.from}, ${s.to})` }} />
                <span className="nm">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <motion.div
        className="gen-row"
        initial={false}
        animate={{ opacity: 1 }}
        style={{ marginTop: 18 }}
      >
        <motion.button
          type="button"
          className="btn btn-primary btn-lg gen-main"
          disabled={!canGo || busy}
          whileTap={{ scale: 0.98 }}
          whileHover={canGo && !busy ? { scale: 1.015 } : {}}
          onClick={go}
        >
          {busy ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <Zap size={19} />}
          {busy ? 'Preparing…' : 'Generate video'}
        </motion.button>
      </motion.div>
      {!canGo && <p className="sm muted" style={{ marginTop: 10 }}>Describe your scene above, then hit generate.</p>}
    </motion.div>
  );
}
