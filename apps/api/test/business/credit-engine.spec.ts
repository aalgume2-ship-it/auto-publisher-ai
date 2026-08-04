import { Test, TestingModule } from '@nestjs/testing';
import { CreditEngineService } from '../../src/modules/billing/credit-engine.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CreditEngineService (Unit)', () => {
  let service: CreditEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CreditEngineService],
    }).compile();

    service = module.get<CreditEngineService>(CreditEngineService);
  });

  it('should deduct credits successfully', async () => {
    const res = await service.deductCredits({
      orgId: 'org-1',
      amount: 50,
      reason: '4K Render',
      referenceId: 'run-1'
    });
    expect(res.status).toBe('SUCCESS');
    expect(res.remainingCredits).toBeDefined();
  });
});
