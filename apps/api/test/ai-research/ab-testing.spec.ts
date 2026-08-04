import { Test, TestingModule } from '@nestjs/testing';
import { AbTestingEngineService } from '../../src/modules/ai-research/ab-testing.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AbTestingEngineService (Unit)', () => {
  let service: AbTestingEngineService;
  let dbMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AbTestingEngineService],
    }).compile();

    service = module.get<AbTestingEngineService>(AbTestingEngineService);
    dbMock = {
      aiExperiment: { 
        create: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ id: 'exp-1', modelAId: 'A', modelBId: 'B' }),
        update: vi.fn()
      },
    };
    (service as any).db = dbMock;
  });

  it('should conclude experiment and pick the model with better score/time ratio', async () => {
    await service.concludeExperiment('exp-1', { quality: 90, timeMs: 1000 }, { quality: 80, timeMs: 2000 });
    
    // Model A: 90/1000 = 0.09. Model B: 80/2000 = 0.04. Model A wins.
    expect(dbMock.aiExperiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ winnerId: 'A', status: 'COMPLETED' })
      })
    );
  });
});
