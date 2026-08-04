import { Test, TestingModule } from '@nestjs/testing';
import { AceGpuScheduler } from '../../src/modules/ace/ace-scheduler.js';
import { StoryEngine, DirectorEngine } from '../../src/modules/ace/engines/core-engines.js';
import { CompositionEngine } from '../../src/modules/ace/engines/post-engines.js';
import { describe, it, expect, beforeEach } from 'vitest';

describe('AceGpuScheduler (Unit)', () => {
  let scheduler: AceGpuScheduler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AceGpuScheduler],
    }).compile();

    scheduler = module.get<AceGpuScheduler>(AceGpuScheduler);
  });

  it('should correctly resolve topological execution order', () => {
    const story = new StoryEngine();
    const director = new DirectorEngine();
    const composition = new CompositionEngine();
    
    // For simplicity in test, mock dependencies
    composition.dependencies = ['ace.director'];

    scheduler.registerEngine(composition);
    scheduler.registerEngine(director);
    scheduler.registerEngine(story);

    const order = scheduler.resolveExecutionOrder();
    
    // Order must be story -> director -> composition
    expect(order).toEqual(['ace.story', 'ace.director', 'ace.composition']);
  });
});
