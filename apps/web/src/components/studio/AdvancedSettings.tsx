'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Sliders } from 'lucide-react';
import type { CreateDraft } from '../../lib/create';

interface AdvancedSettingsProps {
  draft: CreateDraft;
  onChange: (d: CreateDraft) => void;
}

const SHOT_TYPES = ['Wide', 'Medium', 'Close-up', 'Aerial', 'POV', 'Tracking'];
const CAMERA_MOVES = ['Static', 'Slow pan', 'Drift', 'Dolly in', 'Dolly out', 'Crane up', 'Handheld'];
const QUALITY_TIERS = ['draft', 'standard', 'high', 'cinema'];
const AUDIO_MODES = ['none', 'ambient', 'voiceover'];

export default function AdvancedSettings({ draft, onChange }: AdvancedSettingsProps) {
  const [open, setOpen] = useState(false);

  function patch(p: Partial<CreateDraft>) {
    onChange({ ...draft, ...p });
  }

  // Extended fields stored in the same draft (TS allows arbitrary keys).
  const ext = draft as CreateDraft & {
    fps?: number;
    resolution?: string;
    shotType?: string;
    cameraMove?: string;
    quality?: string;
    audio?: string;
    negative?: string;
    seed?: number;
  };

  return (
    <section className="glass" style={{ padding: 18 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          border: 0,
          color: 'inherit',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sliders size={16} />
          <span className="section-tag" style={{ margin: 0 }}>Advanced settings</span>
        </span>
        <ChevronDown
          size={18}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 16 }}>
              <Field label="FPS">
                <select className="chip" value={ext.fps ?? 24} onChange={(e) => patch({ fps: Number(e.target.value) })}>
                  {[12, 24, 30, 48, 60].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Resolution">
                <select className="chip" value={ext.resolution ?? '1280x720'} onChange={(e) => patch({ resolution: e.target.value })}>
                  {['640x360', '854x480', '1280x720', '1920x1080', '3840x2160'].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Shot type">
                <select className="chip" value={ext.shotType ?? 'Wide'} onChange={(e) => patch({ shotType: e.target.value })}>
                  {SHOT_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Camera movement">
                <select className="chip" value={ext.cameraMove ?? 'Slow pan'} onChange={(e) => patch({ cameraMove: e.target.value })}>
                  {CAMERA_MOVES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Quality">
                <select className="chip" value={ext.quality ?? 'high'} onChange={(e) => patch({ quality: e.target.value })}>
                  {QUALITY_TIERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Audio">
                <select className="chip" value={ext.audio ?? 'none'} onChange={(e) => patch({ audio: e.target.value })}>
                  {AUDIO_MODES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Seed (optional)">
                <input
                  className="chip"
                  type="number"
                  value={ext.seed ?? ''}
                  placeholder="random"
                  onChange={(e) => patch({ seed: e.target.value ? Number(e.target.value) : undefined })}
                  style={{ width: '100%' }}
                />
              </Field>
              <Field label="Negative prompt" full>
                <input
                  className="chip"
                  type="text"
                  value={ext.negative ?? ''}
                  placeholder="things to avoid (e.g. text, watermark, low quality)"
                  onChange={(e) => patch({ negative: e.target.value })}
                  style={{ width: '100%' }}
                />
              </Field>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: full ? '1 / -1' : undefined }}>
      <span className="sm muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
