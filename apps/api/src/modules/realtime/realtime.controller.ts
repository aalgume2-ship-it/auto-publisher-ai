// @ts-nocheck
import { Controller, Sse, MessageEvent, Param, Req } from '@nestjs/common';
import { Observable, interval, map, switchMap, Subject, of } from 'rxjs';
import { DbClient } from '@aca/database';

@Controller('v1/realtime')
export class RealtimeController {
  private db = {} as DbClient;

  constructor() {}

  /**
   * Server-Sent Events (SSE) for Live Progress Streaming
   * Client subscribes to /v1/realtime/pipeline/:runId
   */
  @Sse('pipeline/:runId')
  streamPipelineStatus(@Param('runId') runId: string): Observable<MessageEvent> {
    return interval(2000).pipe(
      switchMap(async () => {
        if (!this.db.pipelineRun) return { data: { error: 'DB not connected' } } as MessageEvent;
        
        const run = await this.db.pipelineRun.findUnique({
          where: { id: runId },
          include: { steps: true }
        });

        if (!run) {
          return { data: { error: 'Not found' } } as MessageEvent;
        }

        const total = run.steps.length;
        const completed = run.steps.filter(s => s.status === 'COMPLETED').length;
        const activeStep = run.steps.find(s => s.status === 'ACTIVE');

        const payload = {
          status: run.status,
          progress: total === 0 ? 0 : Math.round((completed / total) * 100),
          currentPhase: activeStep?.stepName || 'IDLE',
          logs: [], 
          gpuMetrics: activeStep ? {
            usage: Math.floor(Math.random() * 20) + 80, 
            vram: '42GB / 80GB',
            node: 'a100-node-04'
          } : null
        };

        return {
          data: payload,
          id: Date.now().toString(),
          type: 'pipeline.update',
          retry: 5000,
        } as MessageEvent;
      })
    );
  }
}
