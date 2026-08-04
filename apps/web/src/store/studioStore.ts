import { create } from 'zustand';

export interface Clip {
  id: string;
  name: string;
  startMs: number;
  durationMs: number;
  type: 'video' | 'audio' | 'effect' | 'text' | 'camera';
  sourceUrl?: string;
  properties: Record<string, any>;
}

export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'effect' | 'text' | 'camera';
  clips: Clip[];
  isMuted: boolean;
  isLocked: boolean;
}

interface StudioState {
  // Timeline State
  tracks: Track[];
  playheadMs: number;
  durationMs: number;
  zoomLevel: number;
  isPlaying: boolean;
  selectedClipIds: string[];

  // Realtime & AI State
  runId: string | null;
  pipelineStatus: string;
  pipelineProgress: number;
  currentAiPhase: string;
  gpuUsage: number;
  
  // Actions
  setPlayhead: (ms: number) => void;
  togglePlayback: () => void;
  setZoom: (level: number) => void;
  addTrack: (track: Track) => void;
  addClip: (trackId: string, clip: Clip) => void;
  updateClipProperties: (clipId: string, properties: Record<string, any>) => void;
  selectClip: (clipId: string, multi?: boolean) => void;
  
  // Sync
  syncPipelineUpdate: (update: any) => void;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  tracks: [
    { id: 't-cam-1', name: 'Camera (AI Director)', type: 'camera', clips: [], isMuted: false, isLocked: false },
    { id: 't-vid-1', name: 'V1 - Main Scene', type: 'video', clips: [], isMuted: false, isLocked: false },
    { id: 't-aud-1', name: 'A1 - Voice (Primary)', type: 'audio', clips: [], isMuted: false, isLocked: false },
  ],
  playheadMs: 0,
  durationMs: 30000, // 30 seconds default
  zoomLevel: 1,
  isPlaying: false,
  selectedClipIds: [],

  runId: null,
  pipelineStatus: 'IDLE',
  pipelineProgress: 0,
  currentAiPhase: 'IDLE',
  gpuUsage: 0,

  setPlayhead: (ms) => set({ playheadMs: Math.max(0, Math.min(ms, get().durationMs)) }),
  
  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),
  
  setZoom: (level) => set({ zoomLevel: Math.max(0.1, Math.min(level, 10)) }),
  
  addTrack: (track) => set((state) => ({ tracks: [...state.tracks, track] })),
  
  addClip: (trackId, clip) => set((state) => ({
    tracks: state.tracks.map(t => t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t)
  })),

  updateClipProperties: (clipId, properties) => set((state) => ({
    tracks: state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => c.id === clipId ? { ...c, properties: { ...c.properties, ...properties } } : c)
    }))
  })),

  selectClip: (clipId, multi = false) => set((state) => ({
    selectedClipIds: multi 
      ? (state.selectedClipIds.includes(clipId) ? state.selectedClipIds.filter(id => id !== clipId) : [...state.selectedClipIds, clipId])
      : [clipId]
  })),

  syncPipelineUpdate: (update) => set({
    pipelineStatus: update.status,
    pipelineProgress: update.progress,
    currentAiPhase: update.currentPhase,
    gpuUsage: update.gpuMetrics?.usage || 0
  })
}));
