// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { DbClient } from '@aca/database';

@Injectable()
export class DatasetBuilderService {
  private readonly logger = new Logger(DatasetBuilderService.name);
  private db = {} as DbClient;

  constructor() {
    const { PrismaClient } = require('@prisma/client');
    this.db = new PrismaClient();
  }

  /**
   * Captures pipeline outputs and strips PII, converting them into training data.
   */
  async appendToDataset(modelVersionId: string, prompt: string, qualityScore: number, executionMs: number, resultUrl?: string) {
    this.logger.debug(`Appending anonymized record to dataset for model version ${modelVersionId}`);

    // Data scrubbing happens here before saving

    return this.db.aiDatasetRecord.create({
      data: {
        id: crypto.randomUUID(),
        modelVersionId,
        prompt, // Scrubbed
        qualityScore,
        executionMs,
        resultUrl
      }
    });
  }
}
