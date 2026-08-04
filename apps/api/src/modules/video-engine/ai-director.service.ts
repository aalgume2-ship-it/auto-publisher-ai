import { Injectable, Logger } from '@nestjs/common';
import { DbClient } from '@aca/database';

@Injectable()
export class AiDirectorService {
  private readonly logger = new Logger(AiDirectorService.name);
  private db = {} as DbClient;

  constructor() {}

  /**
   * Acts as a Cinematographer.
   * Decides exact camera moves, lenses, and lighting for a specific shot
   * based on the emotion and story pacing required.
   */
  async directShot(shotId: string, context: { emotion: string, pacing: string, environment: string }) {
    this.logger.log(`AI Director directing shot ${shotId} [emotion: ${context.emotion}]`);

    // In production, this consults the Local LLM via PromptCompiler for artistic decisions
    const decisions = this.simulateDirectorLogic(context);

    return this.db.aiDirectorDecision.create({
      data: {
        id: crypto.randomUUID(),
        shotId,
        cameraMove: decisions.cameraMove,
        lens: decisions.lens,
        depthOfField: decisions.depthOfField,
        lighting: decisions.lighting,
        transitionIn: decisions.transitionIn,
        colorGrade: decisions.colorGrade,
        pacing: context.pacing
      }
    });
  }

  private simulateDirectorLogic(ctx: { emotion: string, pacing: string, environment: string }) {
    if (ctx.emotion === 'intense' && ctx.pacing === 'fast') {
      return { cameraMove: 'Handheld_Shake', lens: '24mm', depthOfField: 'deep', lighting: 'high_contrast', transitionIn: 'glitch', colorGrade: 'cyberpunk' };
    }
    if (ctx.emotion === 'sad' || ctx.pacing === 'slow') {
      return { cameraMove: 'Slow_Dolly_In', lens: '85mm', depthOfField: 'shallow', lighting: 'soft_window_light', transitionIn: 'fade_from_black', colorGrade: 'desaturated' };
    }
    // Default cinematic
    return { cameraMove: 'Steadicam_Follow', lens: '50mm', depthOfField: 'medium', lighting: 'cinematic_key', transitionIn: 'cut', colorGrade: 'teal_orange' };
  }
}
