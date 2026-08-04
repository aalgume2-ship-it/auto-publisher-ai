import { Test, TestingModule } from '@nestjs/testing';
import { OrchestratorService } from '../../src/modules/orchestrator/orchestrator.service.js';
import { getQueueToken, getFlowProducerToken } from '@nestjs/bullmq';
import { QualityAnalyzerService } from '../../src/modules/pipeline-services/quality-analyzer.service.js';
import { CostEngineService } from '../../src/modules/pipeline-services/cost-engine.service.js';
import { ArtifactStoreService } from '../../src/modules/pipeline-services/artifact-store.service.js';
import { PromptCompilerService } from '../../src/modules/ai-foundation/prompt-compiler.service.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('OrchestratorService (E2E Pipeline)', () => {
  let service: OrchestratorService;
  let videoQueueMock: any;
  let flowProducerMock: any;
  let qualityMock: any;
  let costMock: any;
  let artifactMock: any;
  let compilerMock: any;
  let dbMock: any;

  beforeEach(async () => {
    videoQueueMock = { add: vi.fn().mockResolvedValue({ id: 'job-123' }) };
    flowProducerMock = { add: vi.fn().mockResolvedValue({ job: { id: 'flow-123' } }) };
    
    qualityMock = { analyzeRun: vi.fn().mockResolvedValue({ isAcceptable: true, failedStages: [], overallScore: 0.95 }) };
    costMock = { trackCost: vi.fn().mockResolvedValue(0.005) };
    artifactMock = { saveArtifact: vi.fn().mockResolvedValue('s3://test') };
    compilerMock = { compile: vi.fn().mockResolvedValue({ global: {}, story: {} }) };

    dbMock = {
      pipelineRun: { create: vi.fn(), update: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        { provide: getQueueToken('video-render'), useValue: videoQueueMock },
        { provide: getQueueToken('publishing'), useValue: {} },
        { provide: getFlowProducerToken('pipeline-flow'), useValue: flowProducerMock },
        { provide: QualityAnalyzerService, useValue: qualityMock },
        { provide: CostEngineService, useValue: costMock },
        { provide: ArtifactStoreService, useValue: artifactMock },
        { provide: PromptCompilerService, useValue: compilerMock },
      ],
    }).compile();

    service = module.get<OrchestratorService>(OrchestratorService);
    (service as any).db = dbMock;
  });

  it('should run full end-to-end pipeline and save artifacts', async () => {
    const intent = { prompt: 'Epic movie trailer', language: 'en', durationSec: 15, type: 'trailer' };
    
    const result = await service.runFullPipeline(intent);
    
    expect(result.status).toBe('RUNNING');
    expect(compilerMock.compile).toHaveBeenCalledWith('Epic movie trailer');
    expect(artifactMock.saveArtifact).toHaveBeenCalledWith(expect.any(String), 'COMPILER', 'JSON', expect.any(Object));
    
    // Check that the full DAG was enqueued
    expect(flowProducerMock.add).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'quality-analysis',
        children: expect.arrayContaining([
          expect.objectContaining({ name: 'export' })
        ])
      })
    );
  });

  it('should trigger a partial retry for failed lip-sync', async () => {
    const result = await service.retryPartial('run-123', ['LIP_SYNC']);
    
    expect(result.status).toBe('RETRYING');
    
    // Check that the DAG for retry only includes Lip Sync, Render, and Export
    expect(flowProducerMock.add).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'export',
        data: expect.objectContaining({ isRetry: true }),
        children: expect.arrayContaining([
          expect.objectContaining({ name: 'render' })
        ])
      })
    );
  });
});
