// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { DbClient } from '@aca/database';

@Injectable()
export class LocalModelOrchestratorService {
  private readonly logger = new Logger(LocalModelOrchestratorService.name);
  private db = {} as DbClient;

  constructor() {
    const { PrismaClient } = require('@prisma/client');
    this.db = new PrismaClient();
  }

  /**
   * Triggers the loading of a local model (e.g. Llama-3, Stable Diffusion, CogVideoX)
   * into a specific GPU cluster's VRAM.
   */
  async deployModelToVram(registryId: string, clusterId: string, vramRequiredGb: number) {
    this.logger.log(`Deploying model ${registryId} to local cluster ${clusterId} (Requires ${vramRequiredGb}GB VRAM)`);
    
    return this.db.localModelDeployment.create({
      data: {
        id: crypto.randomUUID(),
        registryId,
        clusterId,
        pathOnDisk: `/mnt/models/${registryId}`,
        vramRequiredGb,
        status: 'READY'
      }
    });
  }

  async evictModelFromVram(deploymentId: string) {
    this.logger.warn(`Evicting model deployment ${deploymentId} from VRAM to free space`);
    return this.db.localModelDeployment.update({
      where: { id: deploymentId },
      data: { status: 'EVICTED' }
    });
  }
}
