import { Injectable } from '@nestjs/common';
import { IAceEngine, IAceContext, IAceResourceRequest } from '../sdk/ace-sdk.js';

@Injectable()
export class CompositionEngine implements IAceEngine {
  engineId = 'ace.composition';
  dependencies = [
    'ace.motion', 'ace.camera', 'ace.lighting', 'ace.fx',
    'ace.lipsync', 'ace.music', 'ace.subtitle'
  ];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 8.0, ramGb: 16, cpuCores: 8 }; // Heaviest operation (merges render graph)
  }

  async process(context: IAceContext, state: Record<string, any>) {
    // Collapses the scene graph into rendered frames
    return { ...state, composedFrames: 'url_to_frames' };
  }
}

@Injectable()
export class EditorEngine implements IAceEngine {
  engineId = 'ace.editor';
  dependencies = ['ace.composition'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 2.0, ramGb: 8, cpuCores: 4 };
  }

  async process(context: IAceContext, state: Record<string, any>) {
    // NLE edits: cuts, transitions, speed ramps
    return { ...state, editedTimeline: {} };
  }
}

@Injectable()
export class QualityEngine implements IAceEngine {
  engineId = 'ace.quality';
  dependencies = ['ace.editor'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 4.0, ramGb: 8, cpuCores: 4 };
  }

  async process(context: IAceContext, state: Record<string, any>) {
    // Post-analysis for artifacting or sync drift
    return { ...state, qualityScore: 0.98 };
  }
}

@Injectable()
export class ExportEngine implements IAceEngine {
  engineId = 'ace.export';
  dependencies = ['ace.quality'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 2.0, ramGb: 8, cpuCores: 4 }; // NVENC / CPU Encoding
  }

  async process(context: IAceContext, state: Record<string, any>) {
    return { ...state, finalExports: { '1080p': 's3://...', '4k': 's3://...' } };
  }
}
