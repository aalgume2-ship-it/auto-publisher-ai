import { Test, TestingModule } from '@nestjs/testing';
import { PromptCompilerService } from '../../src/modules/ai-foundation/prompt-compiler.service.js';
import { ModelRegistryService } from '../../src/modules/ai-foundation/model-registry.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('PromptCompilerService (Unit)', () => {
  let service: PromptCompilerService;
  let registryMock: any;

  beforeEach(async () => {
    registryMock = {
      resolveBestModel: vi.fn().mockResolvedValue({ provider: 'local', name: 'llama-3' })
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromptCompilerService,
        { provide: ModelRegistryService, useValue: registryMock }
      ],
    }).compile();

    service = module.get<PromptCompilerService>(PromptCompilerService);
  });

  it('should compile a simple prompt into a complex JSON story tree', async () => {
    const result = await service.compile('Explain AI to kids');
    expect(result.story.chapters).toBeDefined();
    expect(result.story.chapters[0].camera).toBeDefined();
    expect(result.story.chapters[0].emotion).toBe('happy');
    expect(registryMock.resolveBestModel).toHaveBeenCalled();
  });
});
