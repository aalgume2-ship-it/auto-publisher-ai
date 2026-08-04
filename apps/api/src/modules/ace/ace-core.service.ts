import { Injectable, Logger, Inject } from '@nestjs/common';
import { AceGpuScheduler } from './ace-scheduler.js';
import { IAceContext } from './sdk/ace-sdk.js';

@Injectable()
export class AceCoreService {
  private readonly logger = new Logger(AceCoreService.name);

  constructor(@Inject(AceGpuScheduler) private readonly scheduler: AceGpuScheduler) {}

  /**
   * Main entry point for the AutoCreator Engine (ACE).
   * Executes the internal Graph pipeline in topological order.
   */
  async renderProject(projectId: string) {
    this.logger.log(`ACE starting render graph for project ${projectId}`);

    const context: IAceContext = {
      projectId,
      sceneGraph: { root: { id: 'root', type: 'SCENE', properties: {} }, version: '1.0' },
      timeline: { tracks: [], clips: [], durationMs: 0 },
      resolution: { w: 1920, h: 1080 },
      fps: 30
    };

    let renderState: Record<string, any> = {};
    const executionOrder = this.scheduler.resolveExecutionOrder();
    this.logger.debug(`ACE Execution Order: ${executionOrder.join(' -> ')}`);

    for (const engineId of executionOrder) {
      const engine = this.scheduler.getEngine(engineId);
      if(!engine) {
        this.logger.warn(`Engine ${engineId} not found, skipping.`);
        continue;
      }
      
      this.logger.debug(`[ACE] Requesting resources for ${engineId}`);
      const resources = await engine.estimateResources(context);
      
      // Simulated: Wait for GPU scheduler to allocate resources...
      
      this.logger.debug(`[ACE] Executing ${engineId}`);
      renderState = await engine.process(context, renderState);
      
      // Streaming rendering check could emit SSE here
    }

    this.logger.log(`ACE Render complete for project ${projectId}`);
    return renderState;
  }
}
