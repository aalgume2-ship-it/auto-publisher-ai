import { Test, TestingModule } from '@nestjs/testing';
import { DailyAutoCreatorWorker } from '../../src/modules/brand-automation/daily-creator.worker.js';
import { SmartVideoCreatorService } from '../../src/modules/brand-automation/smart-creator.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('DailyAutoCreatorWorker (Unit)', () => {
  let worker: DailyAutoCreatorWorker;
  let dbMock: any;
  let creatorMock: any;

  beforeEach(async () => {
    creatorMock = { generateFromAssets: vi.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyAutoCreatorWorker,
        { provide: SmartVideoCreatorService, useValue: creatorMock }
      ],
    }).compile();

    worker = module.get<DailyAutoCreatorWorker>(DailyAutoCreatorWorker);
    
    dbMock = {
      brandAutomationRule: { 
        findMany: vi.fn().mockResolvedValue([{ id: 'r-1', brandKitId: 'b-1', frequency: 'DAILY', videosPerRun: 2, name: 'Daily Shorts' }]),
        update: vi.fn()
      }
    };
    (worker as any).db = dbMock;
  });

  it('should sweep active rules and execute the generator multiple times', async () => {
    await worker.processDailyRules();
    
    expect(dbMock.brandAutomationRule.findMany).toHaveBeenCalled();
    // videosPerRun is 2, so it should call the generator twice
    expect(creatorMock.generateFromAssets).toHaveBeenCalledTimes(2);
    expect(dbMock.brandAutomationRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastRunAt: expect.any(Date),
          nextRunAt: expect.any(Date)
        })
      })
    );
  });
});
