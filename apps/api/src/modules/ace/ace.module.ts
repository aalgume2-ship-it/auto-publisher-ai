import { Module, Global } from '@nestjs/common';
import { AceGpuScheduler } from './ace-scheduler.js';
import { AceCoreService } from './ace-core.service.js';
import { StoryEngine, DirectorEngine, SceneEngine, CharacterEngine } from './engines/core-engines.js';
import { MotionEngine, CameraEngine, LightingEngine, FxEngine } from './engines/visual-engines.js';
import { VoiceEngine, LipSyncEngine, MusicEngine, SubtitleEngine } from './engines/audio-engines.js';
import { CompositionEngine, EditorEngine, QualityEngine, ExportEngine } from './engines/post-engines.js';

@Global()
@Module({
  providers: [
    AceGpuScheduler,
    AceCoreService,
    StoryEngine, DirectorEngine, SceneEngine, CharacterEngine,
    MotionEngine, CameraEngine, LightingEngine, FxEngine,
    VoiceEngine, LipSyncEngine, MusicEngine, SubtitleEngine,
    CompositionEngine, EditorEngine, QualityEngine, ExportEngine
  ],
  exports: [AceCoreService, AceGpuScheduler]
})
export class AceModule {
  constructor(
    private scheduler: AceGpuScheduler,
    private story: StoryEngine, private director: DirectorEngine, private scene: SceneEngine, private character: CharacterEngine,
    private motion: MotionEngine, private camera: CameraEngine, private lighting: LightingEngine, private fx: FxEngine,
    private voice: VoiceEngine, private lipsync: LipSyncEngine, private music: MusicEngine, private subtitle: SubtitleEngine,
    private composition: CompositionEngine, private editor: EditorEngine, private quality: QualityEngine, private exportEngine: ExportEngine
  ) {}

  onModuleInit() {
    if(!this.scheduler) return;
    this.scheduler.registerEngine(this.story);
    this.scheduler.registerEngine(this.director);
    this.scheduler.registerEngine(this.scene);
    this.scheduler.registerEngine(this.character);
    this.scheduler.registerEngine(this.motion);
    this.scheduler.registerEngine(this.camera);
    this.scheduler.registerEngine(this.lighting);
    this.scheduler.registerEngine(this.fx);
    this.scheduler.registerEngine(this.voice);
    this.scheduler.registerEngine(this.lipsync);
    this.scheduler.registerEngine(this.music);
    this.scheduler.registerEngine(this.subtitle);
    this.scheduler.registerEngine(this.composition);
    this.scheduler.registerEngine(this.editor);
    this.scheduler.registerEngine(this.quality);
    this.scheduler.registerEngine(this.exportEngine);
  }
}
