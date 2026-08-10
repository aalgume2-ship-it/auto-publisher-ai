'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Image as ImageIcon, Trash2, Upload, X } from 'lucide-react';

export type RefRole = 'character' | 'product' | 'style' | 'scene' | 'first_frame' | 'last_frame';

const ROLE_LABELS: Record<RefRole, string> = {
  character: 'Character',
  product: 'Product',
  style: 'Style',
  scene: 'Scene',
  first_frame: 'First frame',
  last_frame: 'Last frame',
};

export interface RefImage {
  id: string;
  dataUrl: string;
  role: RefRole;
  name: string;
}

const MAX_IMAGES = 6;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per image
const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];

function newId(): string {
  return 'ref_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default function ReferenceImages({
  images,
  onChange,
}: {
  images: string[]; // kept for compat with /create; we use ids internally
  onChange: (dataUrls: string[]) => void;
}) {
  // Persist richer data in localStorage so we don't lose role on reload.
  const [items, setItems] = useState<RefImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function commit(next: RefImage[]) {
    setItems(next);
    onChange(next.map((i) => i.dataUrl));
  }

  async function handleFiles(files: FileList | File[]) {
    setError(null);
    const arr = Array.from(files);
    if (items.length + arr.length > MAX_IMAGES) {
      setError(`You can attach at most ${MAX_IMAGES} reference images.`);
      return;
    }
    const next: RefImage[] = [...items];
    for (const f of arr) {
      if (!ACCEPT.includes(f.type)) {
        setError(`Unsupported file type: ${f.type || 'unknown'}. Use PNG, JPEG, or WebP.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`${f.name} is larger than 8 MB.`);
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(f);
      });
      next.push({ id: newId(), dataUrl, role: 'character', name: f.name });
    }
    commit(next);
  }

  function move(id: string, dir: -1 | 1) {
    const i = items.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  }

  function setRole(id: string, role: RefRole) {
    commit(items.map((x) => (x.id === id ? { ...x, role } : x)));
  }

  function remove(id: string) {
    commit(items.filter((x) => x.id !== id));
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass"
      style={{ padding: 18 }}
      aria-label="Reference images"
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <span className="section-tag">Reference Images</span>
          <p className="sm muted" style={{ marginTop: 4 }}>
            Drag &amp; drop or pick images. Used as {ROLE_LABELS.character.toLowerCase()}, {ROLE_LABELS.product.toLowerCase()}, {ROLE_LABELS.style.toLowerCase()}, or as the first/last frame.
          </p>
        </div>
        <span className="chip" style={{ pointerEvents: 'none' }}>{items.length} / {MAX_IMAGES}</span>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer?.files?.length) void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click();
        }}
        style={{
          border: `1.5px dashed ${dragOver ? 'var(--accent-strong)' : 'rgba(255,255,255,0.18)'}`,
          borderRadius: 14,
          padding: 22,
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? 'rgba(212,255,50,0.05)' : 'transparent',
        }}
      >
        <Upload size={22} style={{ opacity: 0.7, marginBottom: 6 }} />
        <div style={{ fontWeight: 600, fontSize: 14 }}>Drop images here, or click to choose</div>
        <div className="sm muted" style={{ marginTop: 4 }}>PNG · JPEG · WebP — up to 8 MB each</div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT.join(',')}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <div
          className="sm"
          style={{
            color: '#ffb4b4',
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <X size={14} /> {error}
        </div>
      )}

      {items.length > 0 && (
        <div
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          {items.map((it, idx) => (
            <div key={it.id} className="glass" style={{ padding: 10, borderRadius: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.dataUrl}
                alt={it.name}
                style={{
                  width: '100%',
                  height: 110,
                  objectFit: 'cover',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)',
                }}
              />
              <div className="sm" style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }} title={it.name}>
                {it.name.length > 22 ? it.name.slice(0, 22) + '…' : it.name}
              </div>
              <select
                className="chip"
                value={it.role}
                onChange={(e) => setRole(it.id, e.target.value as RefRole)}
                style={{ marginTop: 6, width: '100%', padding: '4px 6px', fontSize: 11 }}
              >
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 4, marginTop: 6, justifyContent: 'space-between' }}>
                <button className="chip" type="button" onClick={() => move(it.id, -1)} disabled={idx === 0} title="Move left">
                  <ArrowLeft size={11} />
                </button>
                <span className="chip" style={{ pointerEvents: 'none', fontSize: 11 }}>#{idx + 1}</span>
                <button className="chip" type="button" onClick={() => move(it.id, 1)} disabled={idx === items.length - 1} title="Move right">
                  <ArrowRight size={11} />
                </button>
                <button className="chip" type="button" onClick={() => remove(it.id)} title="Remove" style={{ color: '#ffb4b4' }}>
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <div className="sm muted" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.6 }}>
          <ImageIcon size={12} /> No references yet — optional, but it helps the model stay on-brief.
        </div>
      )}
    </motion.section>
  );
}
