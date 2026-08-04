import { Injectable, Logger } from '@nestjs/common';
import { DbClient } from '@aca/database';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private db = {} as DbClient;

  constructor() {}

  async logAction(orgId: string, actorId: string, action: string, entityType: string, entityId?: string, metadata?: any, reqInfo?: { ip: string, userAgent: string }) {
    this.logger.log(`Audit: ${actorId} performed ${action} on ${entityType} in org ${orgId}`);

    // Production code would push this via an Outbox pattern or BullMQ to avoid slowing down HTTP responses
    return {
      status: 'LOGGED',
      id: crypto.randomUUID()
    };
  }
}
