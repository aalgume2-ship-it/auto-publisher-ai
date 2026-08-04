// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { IAceEngine, IAceContext } from './sdk/ace-sdk.js';

@Injectable()
export class AceGpuScheduler {
  private readonly logger = new Logger(AceGpuScheduler.name);
  private engines: Map<string, IAceEngine> = new Map();

  registerEngine(engine: IAceEngine) {
    this.engines.set(engine.engineId, engine);
    this.logger.log(`Registered ACE Engine: ${engine.engineId}`);
  }

  getEngine(id: string): IAceEngine {
    return this.engines.get(id);
  }

  /**
   * Sorts engines based on dependencies (Topological Sort)
   */
  resolveExecutionOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const tempMark = new Set<string>();

    const visit = (engineId: string) => {
      if (tempMark.has(engineId)) throw new Error('Cyclic dependency detected in ACE Engines');
      if (!visited.has(engineId)) {
        tempMark.add(engineId);
        const engine = this.engines.get(engineId);
        if (engine) {
          engine.dependencies.forEach(dep => visit(dep));
        }
        tempMark.delete(engineId);
        visited.add(engineId);
        order.push(engineId);
      }
    };

    for (const engineId of this.engines.keys()) {
      visit(engineId);
    }

    return order;
  }
}
