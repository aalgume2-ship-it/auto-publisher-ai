// @ts-nocheck
import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectFlowProducer, InjectQueue } from '@nestjs/bullmq';
import { FlowProducer, Queue } from 'bullmq';
import { DbClient } from '@aca/database';
import { QualityAnalyzerService } from '../pipeline-services/quality-analyzer.service.js';
import { CostEngineService } from '../pipeline-services/cost-engine.service.js';
import { ArtifactStoreService } from '../pipeline-services/artifact-store.service.js';
import { PromptCompilerService } from '../ai-foundation/prompt-compiler.service.js';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private db = {} as DbClient;

  constructor(
    @InjectQueue('video-render') private videoRenderQueue: Queue,
    @InjectQueue('publishing') private publishingQueue: Queue,
    @InjectFlowProducer('pipeline-flow') private flowProducer: FlowProducer,
    @Inject(QualityAnalyzerService) private readonly quality: QualityAnalyzerService,
    @Inject(CostEngineService) private readonly costEngine: CostEngineService,
    @Inject(ArtifactStoreService) private readonly artifactStore: ArtifactStoreService,
    @Inject(PromptCompilerService) private readonly promptCompiler: PromptCompilerService,
  ) {}

  async runFullPipeline(intent: any) {
    this.logger.log(`Initiating full E2E pipeline`);
    const runId = crypto.randomUUID();

    // 1. Initial State
    await this.db.pipelineRun?.create({
      data: {
        id: runId,
        projectId: intent.projectId || crypto.randomUUID(),
        status: 'QUEUED',
        trigger: 'MANUAL',
      }
    });

    // 2. Prompt Compiler (Sync execution for immediate DAG building)
    const compiled = await this.promptCompiler.compile(intent.prompt);
    await this.artifactStore.saveArtifact(runId, 'COMPILER', 'JSON', compiled);

    // 3. Build Full DAG with dependencies
    const flow = await this.flowProducer.add({
      name: 'quality-analysis',
      queueName: 'video-render',
      data: { runId, step: 'QUALITY_ANALYSIS' },
      opts: { attempts: 1 },
      children: [
        {
          name: 'export',
          queueName: 'video-render',
          data: { runId, step: 'EXPORT' },
          children: [
            {
              name: 'editor',
              queueName: 'video-render',
              data: { runId, step: 'EDITOR' },
              children: [
                {
                  name: 'composition',
                  queueName: 'video-render',
                  data: { runId, step: 'COMPOSITION' },
                  children: [
                    {
                      name: 'render',
                      queueName: 'video-render',
                      data: { runId, step: 'RENDER' },
                      children: [
                        { name: 'camera', queueName: 'video-render', data: { runId, step: 'CAMERA' }, children: [{ name: 'director', queueName: 'video-render', data: { runId, step: 'DIRECTOR' } }] },
                        { name: 'character', queueName: 'video-render', data: { runId, step: 'CHARACTER' } },
                        { name: 'lip-sync', queueName: 'video-render', data: { runId, step: 'LIP_SYNC' }, children: [{ name: 'voice', queueName: 'video-render', data: { runId, step: 'VOICE' } }] }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });

    await this.db.pipelineRun?.update({
      where: { id: runId },
      data: { status: 'RUNNING' }
    });

    return { runId, flowId: flow.job.id, status: 'RUNNING' };
  }

  async retryPartial(runId: string, failedStages: string[]) {
    this.logger.log(`Retrying run ${runId} from stages: ${failedStages.join(',')}`);
    
    // In production, we'd dynamically reconstruct the DAG starting only from the failed nodes
    // For now, we simulate queuing just the Lip-Sync -> Render -> Export chain if LIP_SYNC failed
    if (failedStages.includes('LIP_SYNC')) {
      const flow = await this.flowProducer.add({
        name: 'export',
        queueName: 'video-render',
        data: { runId, step: 'EXPORT', isRetry: true },
        children: [
          {
            name: 'render',
            queueName: 'video-render',
            data: { runId, step: 'RENDER', isRetry: true },
            children: [
              { name: 'lip-sync', queueName: 'video-render', data: { runId, step: 'LIP_SYNC', isRetry: true } }
            ]
          }
        ]
      });
      return { runId, flowId: flow.job.id, status: 'RETRYING' };
    }

    return { runId, status: 'FAILED_UNRECOVERABLE' };
  }
}
