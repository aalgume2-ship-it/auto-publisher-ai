import { describe, expect, it } from 'vitest';
import {
  VIDEO_PROVIDERS,
  parseDidTalk,
  parsePictoryJob,
} from '../src/ai/providers-video.js';

describe('optional video provider contracts', () => {
  it('keeps Pictory before D-ID and exposes only env-key metadata', () => {
    const ids = VIDEO_PROVIDERS.map((provider) => provider.id);
    expect(ids.indexOf('pictory')).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf('d-id')).toBeGreaterThan(ids.indexOf('pictory'));
    expect(VIDEO_PROVIDERS.find((provider) => provider.id === 'pictory')?.envKey).toBe('PICTORY_API_KEY');
    expect(VIDEO_PROVIDERS.find((provider) => provider.id === 'd-id')?.envKey).toBe('D_ID_API_KEY');
  });

  it('parses Pictory submit and completed job envelopes', () => {
    expect(parsePictoryJob({ data: { jobId: 'pictory-job-1' } })).toEqual({
      id: 'pictory-job-1', status: null, url: null, error: null,
    });
    expect(parsePictoryJob({ data: { status: 'completed', url: 'https://cdn.example/pictory.mp4' } })).toEqual({
      id: null, status: 'completed', url: 'https://cdn.example/pictory.mp4', error: null,
    });
    expect(parsePictoryJob({ data: { status: 'failed', error: { detail: 'quota' } } }).error).toBe('quota');
  });

  it('parses D-ID talk responses and webhook-shaped errors', () => {
    expect(parseDidTalk({ id: 'talk-1', status: 'done', result_url: 'https://cdn.example/talk.mp4' })).toEqual({
      id: 'talk-1', status: 'done', url: 'https://cdn.example/talk.mp4', error: null,
    });
    expect(parseDidTalk({ data: { id: 'talk-2', status: 'error', description: 'moderation' } })).toEqual({
      id: 'talk-2', status: 'error', url: null, error: 'moderation',
    });
  });
});
