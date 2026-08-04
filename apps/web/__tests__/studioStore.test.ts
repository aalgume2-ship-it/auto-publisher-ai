import { renderHook, act } from '@testing-library/react';
import { useStudioStore } from '../src/store/studioStore';
import { describe, it, expect, beforeEach } from 'vitest';

describe('StudioStore', () => {
  beforeEach(() => {
    // Reset store before each test
    const { setPlayhead, togglePlayback } = useStudioStore.getState();
    act(() => {
      setPlayhead(0);
      if (useStudioStore.getState().isPlaying) {
        togglePlayback();
      }
    });
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useStudioStore());
    expect(result.current.tracks.length).toBe(3);
    expect(result.current.playheadMs).toBe(0);
    expect(result.current.isPlaying).toBe(false);
  });

  it('should update playhead', () => {
    const { result } = renderHook(() => useStudioStore());
    
    act(() => {
      result.current.setPlayhead(5000);
    });

    expect(result.current.playheadMs).toBe(5000);
  });

  it('should not allow playhead to exceed duration', () => {
    const { result } = renderHook(() => useStudioStore());
    
    act(() => {
      result.current.setPlayhead(9999999);
    });

    expect(result.current.playheadMs).toBe(result.current.durationMs);
  });

  it('should toggle playback state', () => {
    const { result } = renderHook(() => useStudioStore());
    
    expect(result.current.isPlaying).toBe(false);
    
    act(() => {
      result.current.togglePlayback();
    });

    expect(result.current.isPlaying).toBe(true);
  });
});
