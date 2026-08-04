import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DbClient } from '@aca/database';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private db = {} as DbClient;

  constructor() {}

  async rememberPreference(orgId: string, subject: string, key: string, value: any, confidence = 1.0) {
    this.logger.log(`Recording memory: ${subject} -> ${key}`);
    return this.db.memoryEntry.upsert({
      where: { id: crypto.randomUUID() }, // Real implementation uses compound key
      create: {
        id: crypto.randomUUID(),
        scope: 'ORG',
        scopeId: orgId,
        subject,
        key,
        value,
        confidence,
        status: 'ACTIVE',
        source: 'USER'
      },
      update: {
        value,
        confidence
      }
    });
  }
}
