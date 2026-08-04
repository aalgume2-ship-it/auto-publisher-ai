/**
 * AutoCreator Engine (ACE) SDK
 * 
 * Defines the core structures: SceneGraph, Timeline, and the base IAceEngine contract.
 */

export interface IAceResourceRequest {
  vramGb: number;
  cudaCores?: number;
  ramGb: number;
  cpuCores: number;
}

export interface IAceNode {
  id: string;
  type: string; // 'CHARACTER', 'CAMERA', 'LIGHTING', 'FX', 'VOICE'
  properties: Record<string, any>;
  children?: IAceNode[];
}

export interface IAceSceneGraph {
  root: IAceNode;
  version: string;
}

export interface IAceTimelineClip {
  id: string;
  trackId: string;
  nodeIdRef: string; // references a node in SceneGraph
  startMs: number;
  durationMs: number;
  properties: Record<string, any>;
}

export interface IAceTimeline {
  tracks: { id: string; type: string; name: string }[];
  clips: IAceTimelineClip[];
  durationMs: number;
}

export interface IAceContext {
  projectId: string;
  sceneGraph: IAceSceneGraph;
  timeline: IAceTimeline;
  resolution: { w: number, h: number };
  fps: number;
}

export interface IAceEngine {
  engineId: string;
  dependencies: string[]; // engines that must run before this one
  
  // Predict resources needed before execution
  estimateResources(context: IAceContext): Promise<IAceResourceRequest>;
  
  // Mutates or produces a new RenderGraph layer
  process(context: IAceContext, previousGraphState: Record<string, any>): Promise<Record<string, any>>;
}
