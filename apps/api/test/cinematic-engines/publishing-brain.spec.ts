import { Test, TestingModule } from '@nestjs/testing';
import { PublishingBrainService } from '../../src/modules/publishing-brain/publishing-brain.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('PublishingBrainService (Unit)', () => {
  let service: PublishingBrainService;
  let dbMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PublishingBrainService],
    }).compile();

    service = module.get<PublishingBrainService>(PublishingBrainService);
    dbMock = {
      publishingBrainStrategy: { create: vi.fn().mockResolvedValue({ id: 'strat-1' }) },
    };
    (service as any).db = dbMock;
  });

  it('should formulate an AI strategy with predicted CTR', async () => {
    await service.formulateStrategy('vid-1', 'Tiktok', { topic: 'AI', duration: 15 });
    expect(dbMock.publishingBrainStrategy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          predictedCTR: 0.085,
          thumbnailStyle: 'high_contrast_face_reaction'
        })
      })
    );
  });
});
