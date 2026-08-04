import { Test, TestingModule } from '@nestjs/testing';
import { CharacterBrainService } from '../../src/modules/character/character-brain.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CharacterBrainService (Unit)', () => {
  let service: CharacterBrainService;
  let dbMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CharacterBrainService],
    }).compile();

    service = module.get<CharacterBrainService>(CharacterBrainService);
    dbMock = {
      characterBrain: { create: vi.fn().mockResolvedValue({ id: 'brain-1' }) },
    };
    (service as any).db = dbMock;
  });

  it('should initialize a brain with personality and expressions', async () => {
    await service.initializeBrain('char-1', { speakingStyle: 'stoic', gait: 'confident', history: 'Veteran' });
    expect(dbMock.characterBrain.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          speakingStyle: 'stoic',
          facialExpressions: expect.any(Object)
        })
      })
    );
  });
});
