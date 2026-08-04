import { Injectable } from '@nestjs/common';
import { IAceEngine, IAceContext, IAceResourceRequest } from '../sdk/ace-sdk.js';

@Injectable()
export class StoryEngine implements IAceEngine {
  engineId = 'ace.story';
  dependencies = []; // Runs first

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 0.5, ramGb: 2, cpuCores: 1 }; // LLM operations
  }

  async process(context: IAceContext, state: Record<string, any>) {
    // Generates narrative structure, adds nodes to state
    return { ...state, narrative: { chapters: [] } };
  }
}

@Injectable()
export class DirectorEngine implements IAceEngine {
  engineId = 'ace.director';
  dependencies = ['ace.story'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 0.5, ramGb: 2, cpuCores: 1 };
  }

  async process(context: IAceContext, state: Record<string, any>) {
    // Decides shots, angles
    return { ...state, shotList: [] };
  }
}

@Injectable()
export class SceneEngine implements IAceEngine {
  engineId = 'ace.scene';
  dependencies = ['ace.director'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 2.0, ramGb: 4, cpuCores: 2 };
  }

  async process(context: IAceContext, state: Record<string, any>) {
    // Builds the 3D/Latent environment parameters
    return { ...state, environment: { timeOfDay: 'Golden Hour' } };
  }
}

@Injectable()
export class CharacterEngine implements IAceEngine {
  engineId = 'ace.character';
  dependencies = ['ace.director'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 4.0, ramGb: 8, cpuCores: 4 };
  }

  async process(context: IAceContext, state: Record<string, any>) {
    // Binds face topology, clothing, identity map
    return { ...state, charactersMap: {} };
  }
}
