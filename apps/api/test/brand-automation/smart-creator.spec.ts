import { Test, TestingModule } from '@nestjs/testing';
import { SmartVideoCreatorService } from '../../src/modules/brand-automation/smart-creator.service.js';
import { PromptCompilerService } from '../../src/modules/ai-foundation/prompt-compiler.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('SmartVideoCreatorService (Unit)', () => {
  let service: SmartVideoCreatorService;
  let dbMock: any;
  let compilerMock: any;

  beforeEach(async () => {
    compilerMock = { compile: vi.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmartVideoCreatorService,
        { provide: PromptCompilerService, useValue: compilerMock }
      ],
    }).compile();

    service = module.get<SmartVideoCreatorService>(SmartVideoCreatorService);
    
    dbMock = {
      brandKit: { 
        findUnique: vi.fn().mockResolvedValue({ 
          id: 'b-1', 
          name: 'TechCorp',
          brandAssets: [{ id: 'a-1', usageCount: 0, subject: 'Laptop' }, { id: 'a-2', usageCount: 5, subject: 'Phone' }] 
        }) 
      },
      brandAsset: { update: vi.fn() },
      brandGeneratedContent: { create: vi.fn().mockResolvedValue({ id: 'content-1' }) }
    };
    (service as any).db = dbMock;
  });

  it('should select least used assets and generate copywriting', async () => {
    const res = await service.generateFromAssets('b-1', 'rule-1');
    
    // Checks that the AI Compiler was triggered
    expect(compilerMock.compile).toHaveBeenCalled();
    
    // Checks that asset usage was incremented
    expect(dbMock.brandAsset.update).toHaveBeenCalledTimes(2);
    
    // Checks that the content was saved with the copy
    expect(dbMock.brandGeneratedContent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          copywritingData: expect.any(Object),
          hookType: expect.any(String)
        })
      })
    );
  });
});
