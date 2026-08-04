// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { DbClient } from '@aca/database';

@Injectable()
export class ArtifactStoreService {
  private readonly logger = new Logger(ArtifactStoreService.name);
  private db = {} as DbClient;

  constructor() {}

  async saveArtifact(runId: string, stepName: string, artifactType: string, payload: any) {
    this.logger.debug(`Saving artifact ${artifactType} for ${stepName}`);
    
    // Simulate S3 upload
    const storageUrl = `s3://aca-artifacts/${runId}/${stepName}_${Date.now()}.${artifactType.toLowerCase()}`;

    await (this.db as any).pipelineArtifact?.create({
      data: {
        id: crypto.randomUUID(),
        runId,
        stepName,
        artifactType,
        storageUrl,
        metadata: { size: JSON.stringify(payload).length }
      }
    });

    return storageUrl;
  }
}
