import { Injectable } from '@nestjs/common';
import { IAceEngine, IAceContext, IAceResourceRequest } from '../sdk/ace-sdk.js';

@Injectable()
export class VoiceEngine implements IAceEngine {
  engineId = 'ace.voice';
  dependencies = ['ace.story', 'ace.character'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 2.0, ramGb: 4, cpuCores: 2 };
  }

  async process(context: IAceContext, state: Record<string, any>) {
    return { ...state, audioTracks: {} };
  }
}

@Injectable()
export class LipSyncEngine implements IAceEngine {
  engineId = 'ace.lipsync';
  dependencies = ['ace.voice', 'ace.motion'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 3.0, ramGb: 4, cpuCores: 2 };
  }

  async process(context: IAceContext, state: Record<string, any>) {
    // Viseme alignment
    return { ...state, visemeMaps: {} };
  }
}

@Injectable()
export class MusicEngine implements IAceEngine {
  engineId = 'ace.music';
  dependencies = ['ace.story'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 1.0, ramGb: 2, cpuCores: 2 };
  }

  async process(context: IAceContext, state: Record<string, any>) {
    return { ...state, backgroundMusic: {} };
  }
}

@Injectable()
export class SubtitleEngine implements IAceEngine {
  engineId = 'ace.subtitle';
  dependencies = ['ace.voice'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 0.5, ramGb: 1, cpuCores: 1 };
  }

  async process(context: IAceContext, state: Record<string, any>) {
    return { ...state, srtData: {} };
  }
}
