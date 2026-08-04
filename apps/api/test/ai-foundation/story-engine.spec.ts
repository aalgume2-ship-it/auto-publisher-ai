import { Test, TestingModule } from '@nestjs/testing';
import { StoryEngineService } from '../../src/modules/ai-foundation/story-engine.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('StoryEngineService (Unit)', () => {
  let service: StoryEngineService;
  let dbMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StoryEngineService],
    }).compile();

    service = module.get<StoryEngineService>(StoryEngineService);

    dbMock = {
      $transaction: vi.fn(async (cb) => cb(dbMock)),
      storySequence: { create: vi.fn().mockResolvedValue({ id: 'story-1' }) },
      storyScene: { create: vi.fn().mockResolvedValue({ id: 'scene-1' }) },
      storyShot: { create: vi.fn().mockResolvedValue({ id: 'shot-1' }) },
    };
    (service as any).db = dbMock;
  });

  it('should breakdown a script into scenes and shots', async () => {
    await service.breakdownScriptToShots('story-1', 'Mock script text');
    
    expect(dbMock.$transaction).toHaveBeenCalled();
    expect(dbMock.storyScene.create).toHaveBeenCalledTimes(2);
    expect(dbMock.storyShot.create).toHaveBeenCalledTimes(2);
  });
});
