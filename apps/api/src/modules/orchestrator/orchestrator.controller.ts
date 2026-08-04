import { Controller, Post, Body, Param } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service.js';

@Controller('v1/pipeline')
export class OrchestratorController {
  constructor(private readonly orchestrator: OrchestratorService) {}

  @Post('run')
  async runPipeline(@Body() body: { prompt: string, language: string, durationSec: number, type: string, characterId?: string, style?: string }) {
    return this.orchestrator.runFullPipeline(body);
  }

  @Post(':runId/retry')
  async retryPipeline(@Param('runId') runId: string, @Body() body: { failedStages: string[] }) {
    return this.orchestrator.retryPartial(runId, body.failedStages);
  }
}
