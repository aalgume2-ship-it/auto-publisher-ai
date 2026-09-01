/* Studio create-flow catalogs + draft persistence. */

export type Aspect = { id: string; label: string; ratio: number; hint: string; sw: number; sh: number };
export type Model = { id: string; name: string; tag: string; cost: number; desc: string };
export type StyleDef = { id: string; name: string; from: string; to: string };

export const MODELS: Model[] = [
  { id: 'story-3d', name: 'قصة 3D احترافية', tag: 'الأفضل والأثبت', cost: 2, desc: 'قصة متحركة متعددة اللقطات بشخصيات متناسقة وصوت عربي.' },
  { id: 'lumen-pro', name: 'واقعي سينمائي', tag: 'واقعي', cost: 3, desc: 'مشاهد واقعية بعدسات وحركة سينمائية.' },
  { id: 'human-presenter', name: 'مقدّم بشري', tag: 'مقدّم', cost: 3, desc: 'شخصية بشرية ثابتة وتعبيرات طبيعية.' },
];

export const ASPECTS: Aspect[] = [
  { id: '9:16', label: '9:16', hint: 'عمودي', ratio: 9 / 16, sw: 9, sh: 16 },
  { id: '1:1', label: '1:1', hint: 'مربع', ratio: 1, sw: 1, sh: 1 },
  { id: '16:9', label: '16:9', hint: 'أفقي', ratio: 16 / 9, sw: 16, sh: 9 },
  { id: '4:3', label: '4:3', hint: 'كلاسيكي', ratio: 4 / 3, sw: 4, sh: 3 },
];

export const DURATIONS = [20, 30, 40, 60];

export const STYLES: StyleDef[] = [
  { id: 'social-3d', name: '3D قصصي احترافي', from: '#ff9f7a', to: '#6f7cff' },
  { id: 'cinematic', name: 'سينمائي', from: '#8b7bff', to: '#ff5d9e' },
  { id: 'documentary', name: 'واقعي طبيعي', from: '#7b8b86', to: '#d7c5a7' },
  { id: 'commercial', name: 'إعلان فاخر', from: '#d4af37', to: '#6d4cff' },
  { id: 'arabic-drama', name: 'دراما عربية', from: '#b66a37', to: '#26344f' },
  { id: 'studio', name: 'استوديو', from: '#d6e7ff', to: '#5274a8' },
  { id: 'soft-daylight', name: 'ضوء نهاري', from: '#fff0b5', to: '#84b9e8' },
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
  model: 'story-3d',
  style: 'social-3d',
  aspect: '9:16',
  duration: 30,
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
    const duration = Number(p.duration);
    return {
      ...DEFAULT_DRAFT,
      ...p,
      duration: Number.isFinite(duration) ? Math.min(60, Math.max(20, duration)) : DEFAULT_DRAFT.duration,
      updatedAt: p.updatedAt ?? 0,
    };
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
