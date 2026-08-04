import { Test, TestingModule } from '@nestjs/testing';
import { ModelRegistryService } from '../../src/modules/ai-foundation/model-registry.service.js';
import { PromptIntelligenceService } from '../../src/modules/ai-foundation/prompt-intelligence.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('PromptIntelligenceService (Unit)', () => {
  let service: PromptIntelligenceService;
  let registryMock: any;
  let dbMock: any;

  beforeEach(async () => {
    registryMock = {
      resolveBestModel: vi.fn().mockResolvedValue({
        provider: 'openai',
        name: 'gpt-4o',
        version: 'latest'
      })
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromptIntelligenceService,
        {
          provide: ModelRegistryService,
          useValue: registryMock,
        }
      ],
    }).compile();

    service = module.get<PromptIntelligenceService>(PromptIntelligenceService);

    dbMock = {
      memoryEntry: { create: vi.fn().mockResolvedValue({}) }
    };
    (service as any).db = dbMock;
  });

  it('should resolve LLM and build optimized video prompt', async () => {
    const raw = 'A cyberpunk city';
    const result = await service.buildOptimizedPrompt(raw, 'VIDEO');
    
    expect(registryMock.resolveBestModel).toHaveBeenCalledWith('LLM', { requiredCapabilities: ['prompt-engineering'] });
    expect(result).toContain('cyberpunk city');
    expect(result).toContain('--ar 16:9'); // checks the simulated optimization
    expect(dbMock.memoryEntry.create).toHaveBeenCalled(); // verified memory storage
  });
});
