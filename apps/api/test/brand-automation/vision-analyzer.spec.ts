import { Test, TestingModule } from '@nestjs/testing';
import { VisionAnalyzerService } from '../../src/modules/brand-automation/vision-analyzer.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('VisionAnalyzerService (Unit)', () => {
  let service: VisionAnalyzerService;
  let dbMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VisionAnalyzerService],
    }).compile();

    service = module.get<VisionAnalyzerService>(VisionAnalyzerService);
    dbMock = {
      brandAsset: { update: vi.fn().mockResolvedValue({ status: 'READY' }) },
    };
    (service as any).db = dbMock;
  });

  it('should analyze image and extract deep metadata', async () => {
    await service.analyzeAsset('asset-1', 'http://img.jpg', 'brand-1');
    
    expect(dbMock.brandAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'READY',
          objectsDetected: expect.any(Array),
          lighting: expect.any(String)
        })
      })
    );
  });
});
