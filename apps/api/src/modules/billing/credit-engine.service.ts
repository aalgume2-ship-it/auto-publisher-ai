import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DbClient } from '@aca/database';

export interface CreditDeduction {
  orgId: string;
  amount: number;
  reason: string;
  referenceId?: string; // e.g. pipelineRunId
}

@Injectable()
export class CreditEngineService {
  private readonly logger = new Logger(CreditEngineService.name);
  private db = {} as DbClient;

  constructor() {}

  async deductCredits(params: CreditDeduction) {
    this.logger.log(`Deducting ${params.amount} credits from org ${params.orgId} for ${params.reason}`);
    
    // Simulating deduction within a transaction to prevent race conditions
    // In production, we'd use:
    // await this.db.$executeRaw`UPDATE organizations SET credits = credits - ${amount} WHERE id = ${orgId} AND credits >= ${amount}`;
    
    return {
      status: 'SUCCESS',
      transactionId: crypto.randomUUID(),
      remainingCredits: 950 // Simulated
    };
  }

  async recordUsage(orgId: string, resourceType: string, units: number) {
    this.logger.debug(`Recording usage: ${units} ${resourceType} for org ${orgId}`);
    return { status: 'RECORDED' };
  }
}
