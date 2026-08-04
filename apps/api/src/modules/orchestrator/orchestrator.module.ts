import { Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service.js';
import { OrchestratorController } from './orchestrator.controller.js';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'video-render',
    }),
    BullModule.registerQueue({
      name: 'publishing',
    }),
    BullModule.registerFlowProducer({
      name: 'pipeline-flow',
    }),
  ],
  controllers: [OrchestratorController],
  providers: [OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
