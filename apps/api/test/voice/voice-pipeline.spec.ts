import { Test, TestingModule } from '@nestjs/testing';
import { VoiceEngineService } from '../../src/modules/voice/voice-engine.service.js';
import { ModelRegistryService } from '../../src/modules/ai-foundation/model-registry.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('VoiceEngineService (Unit) - Pipeline', () => {
  let service: VoiceEngineService;
  let registryMock: any;

  beforeEach(async () => {
    registryMock = {
      resolveBestModel: vi.fn().mockResolvedValue({
        provider: 'elevenlabs',
        name: 'eleven_multilingual_v2'
      })
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoiceEngineService,
        { provide: ModelRegistryService, useValue: registryMock }
      ],
    }).compile();

    service = module.get<VoiceEngineService>(VoiceEngineService);
  });

  it('should synthesize speech and return lip-sync metadata', async () => {
    const result = await service.synthesizeSpeech('Hello world', 'profile-1', 'happy');
    
    expect(registryMock.resolveBestModel).toHaveBeenCalledWith('VOICE', { requiredCapabilities: ['emotion-control'] });
    expect(result.audioUrl).toContain('.wav');
    expect(result.lipSyncMap).toBeDefined();
    expect(result.lipSyncMap.length).toBeGreaterThan(0);
  });

  it('should request cloning-capable model for voice cloning', async () => {
    const result = await service.cloneVoice(Buffer.from('test'), 'org-1', 'New Clone');
    
    expect(registryMock.resolveBestModel).toHaveBeenCalledWith('VOICE', { requiredCapabilities: ['zero-shot-cloning'] });
    expect(result.status).toBe('READY');
  });
});
