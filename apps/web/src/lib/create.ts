/* Studio create-flow catalogs + draft persistence (all original values). */

export type Aspect = { id: string; label: string; ratio: number; hint: string; sw: number; sh: number };
export type Model = { id: string; name: string; tag: string; cost: number; desc: string };
export type StyleDef = { id: string; name: string; from: string; to: string };

export const MODELS: Model[] = [
  { id: 'lumen-pro', name: 'Lumen Pro', tag: 'Cinematic', cost: 3, desc: 'Film-grade motion, depth and light.' },
  { id: 'lumen-fast', name: 'Lumen Fast', tag: 'Quick', cost: 1, desc: 'Near-instant drafts for rapid iteration.' },
  { id: 'aether-4k', name: 'Aether 4K', tag: 'Ultra HD', cost: 6, desc: 'Maximum resolution, finest detail.' },
];

export const ASPECTS: Aspect[] = [
  { id: '9:16', label: '9:16', hint: 'Vertical', ratio: 9 / 16, sw: 9, sh: 16 },
  { id: '1:1', label: '1:1', hint: 'Square', ratio: 1, sw: 1, sh: 1 },
  { id: '16:9', label: '16:9', hint: 'Wide', ratio: 16 / 9, sw: 16, sh: 9 },
  { id: '4:3', label: '4:3', hint: 'Classic', ratio: 4 / 3, sw: 4, sh: 3 },
];

export const DURATIONS = [4, 6, 8, 10];

export const STYLES: StyleDef[] = [
  { id: 'cinematic', name: 'Cinematic', from: '#8b7bff', to: '#ff5d9e' },
  { id: 'neon', name: 'Neon Noir', from: '#00e5ff', to: '#e25cff' },
  { id: 'aurora', name: 'Aurora', from: '#3dffc0', to: '#4cc9ff' },
  { id: 'ember', name: 'Ember', from: '#ffc978', to: '#ff5d9e' },
  { id: 'ice', name: 'Ice', from: '#bfe6ff', to: '#8b7bff' },
  { id: 'bloom', name: 'Bloom', from: '#ff8fd0', to: '#e25cff' },
];

export interface CreateDraft {
  prompt: string;
  model: string;
  style: string;
  aspect: string;
  duration: number;
  negative?: string;
  seed?: number;
  updatedAt?: number;
}

export const DEFAULT_DRAFT: CreateDraft = {
  prompt: '',
  model: 'lumen-pro',
  style: 'cinematic',
  aspect: '9:16',
  duration: 6,
  seed: Math.floor(Math.random() * 1e6),
  updatedAt: 0,
};

const KEY = 'lumen.create.v1';

export function loadDraft(): CreateDraft {
  if (typeof window === 'undefined') return { ...DEFAULT_DRAFT };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_DRAFT };
    const p = JSON.parse(raw) as Partial<CreateDraft>;
    return { ...DEFAULT_DRAFT, ...p, updatedAt: p.updatedAt ?? 0 };
  } catch {
    return { ...DEFAULT_DRAFT };
  }
}

export function saveDraft(d: Partial<CreateDraft>): CreateDraft {
  const next = { ...loadDraft(), ...d, updatedAt: Date.now() };
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearDraft(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(KEY);
}

