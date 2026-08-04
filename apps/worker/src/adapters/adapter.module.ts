import { Module } from '@nestjs/common';
import { AiOrchestrationEngine } from './ai-engine.service.js';

@Module({
  providers: [AiOrchestrationEngine],
  exports: [AiOrchestrationEngine]
})
export class AiAdapterModule {}
