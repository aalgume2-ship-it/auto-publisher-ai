import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsAiService } from '../../src/modules/analytics-ai/analytics-ai.service.js';
import { MemoryGraphService } from '../../src/modules/memory-graph/memory-graph.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AnalyticsAiService (Unit) - Self Learning Loop', () => {
  let service: AnalyticsAiService;
  let dbMock: any;
  let memoryGraphMock: any;

  beforeEach(async () => {
    memoryGraphMock = { recordInteraction: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsAiService,
        { provide: MemoryGraphService, useValue: memoryGraphMock }
      ],
    }).compile();

    service = module.get<AnalyticsAiService>(AnalyticsAiService);
    dbMock = {
      analyticsFeedbackLoop: { create: vi.fn().mockResolvedValue({ id: 'loop-1' }) },
    };
    (service as any).db = dbMock;
  });

  it('should process high retention and reinforce memory graph', async () => {
    await service.processFeedbackLoop('vid-1', 'org-1', { retention: 0.75, ctr: 0.1, engagement: 0.2 });
    
    expect(dbMock.analyticsFeedbackLoop.create).toHaveBeenCalled();
    expect(memoryGraphMock.recordInteraction).toHaveBeenCalledWith(
      'org-1', 'Fast_Pacing', 'CAMERA', 'High_Retention', 'STYLE', 'CORRELATES_WITH_HIGH_RETENTION'
    );
  });
});
