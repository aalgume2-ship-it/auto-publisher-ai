import { Injectable } from '@nestjs/common';
import { IAceEngine, IAceContext, IAceResourceRequest } from '../sdk/ace-sdk.js';

@Injectable()
export class MotionEngine implements IAceEngine {
  engineId = 'ace.motion';
  dependencies = ['ace.character'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 4.0, ramGb: 8, cpuCores: 4 };
  }

  async process(context: IAceContext, state: Record<string, any>) {
    // Calculates skeletal physics and gait
    return { ...state, motionData: {} };
  }
}

@Injectable()
export class CameraEngine implements IAceEngine {
  engineId = 'ace.camera';
  dependencies = ['ace.director', 'ace.scene'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 1.0, ramGb: 2, cpuCores: 2 };
  }

  async process(context: IAceContext, state: Record<string, any>) {
    // Math tracks for FPV, Dolly, Orbit
    return { ...state, cameraSplines: {} };
  }
}

@Injectable()
export class LightingEngine implements IAceEngine {
  engineId = 'ace.lighting';
  dependencies = ['ace.scene', 'ace.camera'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 2.0, ramGb: 4, cpuCores: 2 };
  }

  async process(context: IAceContext, state: Record<string, any>) {
    // Key, Fill, Rim HDR maps
    return { ...state, lightingRigs: {} };
  }
}

@Injectable()
export class FxEngine implements IAceEngine {
  engineId = 'ace.fx';
  dependencies = ['ace.camera', 'ace.lighting'];

  async estimateResources(): Promise<IAceResourceRequest> {
    return { vramGb: 4.0, ramGb: 8, cpuCores: 4 }; // Heavy particles
  }

  async process(context: IAceContext, state: Record<string, any>) {
    // Smoke, fire, rain plates
    return { ...state, vfxLayers: {} };
  }
}
