import { Test, TestingModule } from '@nestjs/testing';
import { QualityAnalyzerService } from '../../src/modules/pipeline-services/quality-analyzer.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('QualityAnalyzerService (Unit)', () => {
  let service: QualityAnalyzerService;
  let dbMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QualityAnalyzerService],
    }).compile();

    service = module.get<QualityAnalyzerService>(QualityAnalyzerService);
    dbMock = {
      qualityAnalysis: { create: vi.fn().mockResolvedValue({ id: 'qa-1' }) },
    };
    (service as any).db = dbMock;
  });

  it('should analyze video and possibly fail lip-sync', async () => {
    // We mock Math.random to force a lip-sync failure
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.05); // forces 0.60
    
    const result = await service.analyzeRun('run-1', 'http://vid.mp4');
    expect(result.isAcceptable).toBe(false);
    expect(result.failedStages).toContain('LIP_SYNC');
    expect(dbMock.qualityAnalysis.create).toHaveBeenCalled();
    
    randomSpy.mockRestore();
  });
});
