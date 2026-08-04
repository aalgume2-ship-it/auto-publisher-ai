// @ts-nocheck
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DbClient } from '@aca/database';

export interface ModelResolutionContext {
  requiredCapabilities: string[];
  preferredProvider?: string;
}

@Injectable()
export class ModelRegistryService {
  private readonly logger = new Logger(ModelRegistryService.name);
  private db = {} as DbClient;

  constructor() {
    const { PrismaClient } = require('@prisma/client');
    this.db = new PrismaClient();
  }

  /**
   * Discovers and registers a new model dynamically at runtime.
   * Enables zero-downtime additions of new LLMs, Voice engines, etc.
   */
  async registerModel(data: { name: string, provider: string, type: string, capabilities: string[], version: string }) {
    this.logger.log(`Registering new ${data.type} model: ${data.name} via ${data.provider}`);
    
    return this.db.$transaction(async (tx) => {
      let registry = await tx.aiModelRegistry.findUnique({ where: { name: data.name } });
      
      if (!registry) {
        registry = await tx.aiModelRegistry.create({
          data: {
            id: crypto.randomUUID(),
            name: data.name,
            provider: data.provider,
            type: data.type,
            capabilities: data.capabilities,
          }
        });
      }

      const version = await tx.aiModelVersion.create({
        data: {
          id: crypto.randomUUID(),
          registryId: registry.id,
          versionTag: data.version,
          isDefault: true, // Auto-promote to default on fresh register
        }
      });

      // Demote others if this is the new default
      await tx.aiModelVersion.updateMany({
        where: { registryId: registry.id, id: { not: version.id } },
        data: { isDefault: false }
      });

      return { registry, version };
    });
  }

  /**
   * Resolves the best available model based on required capabilities.
   * Fulfills "Model Agnosticism" requirement.
   */
  async resolveBestModel(type: string, context: ModelResolutionContext) {
    this.logger.debug(`Resolving best model for type: ${type}`);
    
    const candidates = await this.db.aiModelRegistry.findMany({
      where: {
        type,
        status: 'ACTIVE',
        ...(context.preferredProvider ? { provider: context.preferredProvider } : {})
      },
      include: {
        versions: {
          where: { isDefault: true }
        }
      }
    });

    if (candidates.length === 0) {
      throw new NotFoundException(`No active models found for type ${type}`);
    }

    // Filter by capabilities
    const matched = candidates.find(c => 
      context.requiredCapabilities.every(cap => c.capabilities.includes(cap))
    );

    if (!matched) {
      throw new NotFoundException(`No model satisfies capabilities: ${context.requiredCapabilities.join(',')}`);
    }

    return {
      registryId: matched.id,
      name: matched.name,
      provider: matched.provider,
      version: matched.versions[0]?.versionTag || 'latest'
    };
  }

  async rollbackModelVersion(registryId: string, toVersionId: string) {
    this.logger.warn(`Rolling back model ${registryId} to version ${toVersionId}`);
    await this.db.aiModelVersion.updateMany({
      where: { registryId },
      data: { isDefault: false }
    });
    return this.db.aiModelVersion.update({
      where: { id: toVersionId },
      data: { isDefault: true }
    });
  }
}
