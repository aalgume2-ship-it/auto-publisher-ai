import { Test, TestingModule } from '@nestjs/testing';
import { AiDirectorService } from '../../src/modules/video-engine/ai-director.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AiDirectorService (Unit)', () => {
  let service: AiDirectorService;
  let dbMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiDirectorService],
    }).compile();

    service = module.get<AiDirectorService>(AiDirectorService);
    dbMock = {
      aiDirectorDecision: { create: vi.fn().mockResolvedValue({ id: 'dec-1' }) },
    };
    (service as any).db = dbMock;
  });

  it('should make intense fast-paced cinematic decisions', async () => {
    await service.directShot('shot-1', { emotion: 'intense', pacing: 'fast', environment: 'city' });
    expect(dbMock.aiDirectorDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cameraMove: 'Handheld_Shake',
          colorGrade: 'cyberpunk'
        })
      })
    );
  });
});
