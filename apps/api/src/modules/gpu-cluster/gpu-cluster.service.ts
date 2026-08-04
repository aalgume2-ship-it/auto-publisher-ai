// @ts-nocheck
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DbClient } from '@aca/database';

@Injectable()
export class GpuClusterService {
  private readonly logger = new Logger(GpuClusterService.name);
  private db = {} as DbClient; // Mock injected instance

  constructor() {}

  /**
   * Registers a new GPU worker node (called by the worker on startup)
   */
  async registerNode(clusterId: string, instanceType: string, ipAddress: string) {
    this.logger.log(`Registering new GPU node ${instanceType} at ${ipAddress}`);
    return this.db.gPUInstance.create({
      data: {
        id: crypto.randomUUID(),
        clusterId,
        instanceType,
        ipAddress,
        status: 'IDLE',
        lastPingAt: new Date(),
      }
    });
  }

  /**
   * Heartbeat mechanism for nodes to report health and usage
   */
  async heartbeat(instanceId: string, metrics: { gpuUsage: number, vramUsage: number }) {
    return this.db.gPUInstance.update({
      where: { id: instanceId },
      data: { 
        lastPingAt: new Date(),
        // Real implementation would push metrics to Prometheus/OpenTelemetry here
      }
    });
  }

  /**
   * GPU Scheduler: Finds an available node and locks it for a job
   */
  async assignJobToNode(jobId: string, requiredType?: string) {
    this.logger.log(`Attempting to assign job ${jobId} to an available GPU node`);
    
    // In PostgreSQL, we use a transaction with SKIP LOCKED to safely pop an available node
    // Prisma raw query for safe concurrent queueing:
    const result = await this.db.$queryRaw<{id: string}[]>`
      UPDATE gpu_instances
      SET status = 'BUSY', current_job_id = ${jobId}::uuid
      WHERE id = (
        SELECT id FROM gpu_instances
        WHERE status = 'IDLE'
        AND last_ping_at > NOW() - INTERVAL '5 minutes'
        ${requiredType ? `AND instance_type = ${requiredType}` : ''}
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id;
    `;

    if (!result || result.length === 0) {
      this.logger.warn('No available GPU nodes found. Job will remain in queue.');
      return null;
    }

    return result[0].id;
  }

  /**
   * Releases a node after job completion or failure
   */
  async releaseNode(instanceId: string) {
    return this.db.gPUInstance.update({
      where: { id: instanceId },
      data: {
        status: 'IDLE',
        currentJobId: null,
        lastPingAt: new Date(),
      }
    });
  }
}
