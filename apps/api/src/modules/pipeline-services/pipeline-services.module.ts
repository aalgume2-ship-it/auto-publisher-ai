import { Module, Global } from '@nestjs/common';
import { QualityAnalyzerService } from './quality-analyzer.service.js';
import { CostEngineService } from './cost-engine.service.js';
import { ArtifactStoreService } from './artifact-store.service.js';

@Global()
@Module({
  providers: [QualityAnalyzerService, CostEngineService, ArtifactStoreService],
  exports: [QualityAnalyzerService, CostEngineService, ArtifactStoreService]
})
export class PipelineServicesModule {}
