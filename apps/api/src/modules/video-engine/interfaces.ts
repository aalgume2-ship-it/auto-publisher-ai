export interface IVideoEngine {
  generateScene(sceneData: any): Promise<string>;
}

export interface ICameraEngine {
  applyMotion(videoId: string, motionType: string): Promise<string>;
}

export interface ICompositionEngine {
  compose(videoClips: string[], audioId: string, subtitlesId?: string): Promise<string>;
}
