import { Test, TestingModule } from '@nestjs/testing';
import { SmartModelSelectorService } from '../../src/modules/ai-research/smart-selector.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SmartModelSelectorService (Unit)', () => {
  let service: SmartModelSelectorService;
  let dbMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmartModelSelectorService],
    }).compile();

    service = module.get<SmartModelSelectorService>(SmartModelSelectorService);
    dbMock = {
      aiModelVersion: { 
        findMany: vi.fn().mockResolvedValue([
          { id: 'v1', costPerRunUsd: 0.10, avgLatencyMs: 5000 },
          { id: 'v2', costPerRunUsd: 0.01, avgLatencyMs: 1000 }
        ])
      },
    };
    (service as any).db = dbMock;
  });

  it('should select v2 because v1 violates latency constraint', async () => {
    const result = await service.selectOptimalModel('LLM', { requiresFastLatency: true });
    expect(result).toBe('v2');
  });

  it('should select v2 because v1 violates cost constraint', async () => {
    const result = await service.selectOptimalModel('LLM', { maxCostUsd: 0.05 });
    expect(result).toBe('v2');
  });
});
