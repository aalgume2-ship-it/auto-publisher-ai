import { Test, TestingModule } from '@nestjs/testing';
import { BenchmarkEngineService } from '../../src/modules/ai-research/benchmark.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('BenchmarkEngineService (Unit)', () => {
  let service: BenchmarkEngineService;
  let dbMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BenchmarkEngineService],
    }).compile();

    service = module.get<BenchmarkEngineService>(BenchmarkEngineService);
    
    dbMock = {
      $transaction: vi.fn(async (cb) => cb(dbMock)),
      aiBenchmarkRun: { create: vi.fn().mockResolvedValue({ id: 'run-1' }) },
      aiModelVersion: { 
        update: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ id: 'v1' }, { id: 'v2' }])
      },
    };
    (service as any).db = dbMock;
  });

  it('should run benchmark, update score, and re-rank models', async () => {
    await service.runBenchmark('v1');
    expect(dbMock.aiBenchmarkRun.create).toHaveBeenCalled();
    expect(dbMock.aiModelVersion.update).toHaveBeenCalled();
    // Update ranking updates all versions found
    expect(dbMock.aiModelVersion.update).toHaveBeenCalledWith(expect.objectContaining({ data: { qualityRank: 1 } }));
  });
});
