import { Test, TestingModule } from '@nestjs/testing';
import { AceCoreService } from '../../src/modules/ace/ace-core.service.js';
import { AceGpuScheduler } from '../../src/modules/ace/ace-scheduler.js';
import { StoryEngine, DirectorEngine } from '../../src/modules/ace/engines/core-engines.js';
import { CompositionEngine, QualityEngine, ExportEngine } from '../../src/modules/ace/engines/post-engines.js';
import { describe, it, expect, beforeEach } from 'vitest';

describe('AceCoreService (Unit)', () => {
  let service: AceCoreService;
  let scheduler: AceGpuScheduler;

  beforeEach(async () => {
    scheduler = new AceGpuScheduler();
    
    // Register specific engines manually for the test
    scheduler.registerEngine(new StoryEngine());
    scheduler.registerEngine(new DirectorEngine());
    scheduler.registerEngine(new CompositionEngine());
    scheduler.registerEngine(new QualityEngine());
    scheduler.registerEngine(new ExportEngine());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AceCoreService,
        { provide: AceGpuScheduler, useValue: scheduler }
      ],
    }).compile();

    service = module.get<AceCoreService>(AceCoreService);
  });

  it('should run the ACE graph sequentially across registered engines', async () => {
    const result = await service.renderProject('proj-1');
    
    // Result should contain keys from engines mutating the state
    expect(result.narrative).toBeDefined();
    expect(result.shotList).toBeDefined();
    expect(result.composedFrames).toBeDefined();
    expect(result.qualityScore).toBeDefined();
    expect(result.finalExports).toBeDefined();
  });
});
