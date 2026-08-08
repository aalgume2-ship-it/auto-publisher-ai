/**
 * @aca/video-engine — FFmpeg 7 rendering orchestrator
 *
 * Exports the core video rendering interface and implementations.
 * All rendering is mediated through IVideoEngine (ADR-005): encode
 * quality is plan-gated, renders are pure functions of RenderJobSpec,
 * and idempotency is guaranteed by specHash.
 */

export { FFmpegEngine } from './ffmpeg/ffmpeg.engine.js';
export type {
  RenderJobSpec,
  RenderJobResult,
  EncodingProfile,
  CaptionTrack,
  SubtitleTrack,
} from './types/render.types.js';
export { RenderJobSpecSchema, EncodingProfileSchema } from './schemas/render.schema.js';
