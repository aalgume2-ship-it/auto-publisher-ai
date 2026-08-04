import { Module, Global } from '@nestjs/common';
import { VisionAnalyzerService } from './vision-analyzer.service.js';
import { SmartVideoCreatorService } from './smart-creator.service.js';
import { DailyAutoCreatorWorker } from './daily-creator.worker.js';

@Global()
@Module({
  providers: [VisionAnalyzerService, SmartVideoCreatorService, DailyAutoCreatorWorker],
  exports: [VisionAnalyzerService, SmartVideoCreatorService, DailyAutoCreatorWorker]
})
export class BrandAutomationModule {}
