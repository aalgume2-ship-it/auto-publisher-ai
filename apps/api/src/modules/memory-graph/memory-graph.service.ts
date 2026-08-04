// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { DbClient } from '@aca/database';

@Injectable()
export class MemoryGraphService {
  private readonly logger = new Logger(MemoryGraphService.name);
  private db = {} as DbClient;

  constructor() {
    const { PrismaClient } = require('@prisma/client');
    this.db = new PrismaClient();
  }

  async recordInteraction(orgId: string, sourceLabel: string, sourceType: string, targetLabel: string, targetType: string, relation: string) {
    this.logger.debug(`Graph Node Edge: ${sourceLabel} --[${relation}]--> ${targetLabel}`);

    return this.db.$transaction(async (tx) => {
      // Upsert Source Node
      let source = await tx.memoryGraphNode.findFirst({ where: { orgId, nodeType: sourceType, label: sourceLabel } });
      if (!source) {
        source = await tx.memoryGraphNode.create({ data: { id: crypto.randomUUID(), orgId, nodeType: sourceType, label: sourceLabel } });
      }

      // Upsert Target Node
      let target = await tx.memoryGraphNode.findFirst({ where: { orgId, nodeType: targetType, label: targetLabel } });
      if (!target) {
        target = await tx.memoryGraphNode.create({ data: { id: crypto.randomUUID(), orgId, nodeType: targetType, label: targetLabel } });
      }

      // Upsert Edge
      let edge = await tx.memoryGraphEdge.findFirst({
        where: { sourceNodeId: source.id, targetNodeId: target.id, relation }
      });

      if (!edge) {
        edge = await tx.memoryGraphEdge.create({
          data: { id: crypto.randomUUID(), sourceNodeId: source.id, targetNodeId: target.id, relation, strength: 0.1 }
        });
      } else {
        await tx.memoryGraphEdge.update({
          where: { id: edge.id },
          data: { strength: Math.min(1.0, edge.strength + 0.1), lastReinforcedAt: new Date() }
        });
      }

      return edge;
    });
  }
}
