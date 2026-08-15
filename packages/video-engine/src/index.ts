/**
 * @aca/video-engine — the REAL pipeline core shared by API (enqueue) and
 * worker (process): AI providers, durable asset store (S3 + Postgres blobs),
 * FFmpeg compose/render, true moving-video generation, image generation,
 * dubbing, render/thumbnail jobs, provider registry.
 */

export { PipelineError, providerNotConfigured, type PipelineErrorCode } from './errors.js';
export { OrgCredentialsService, type VaultCapability } from './vault/org-credentials.js';
export { LLM_PROVIDERS, LLM_PROVIDER_MAP, chatCompletion, type LlmCredential, type LlmProviderDef } from './ai/providers.js';
export { VIDEO_PROVIDERS, VIDEO_PROVIDER_MAP, type VideoCredential, type VideoProviderDef } from './ai/providers-video.js';
export { getPrompt, renderUserPrompt } from './ai/prompts/registry.js';
export {
  AiService,
  SceneSchema,
  VideoScriptSchema,
  extractJson,
  type VideoScript,
  type ScriptRequest,
  type ImageGenRequest,
  type ImageGenResult,
} from './ai/ai.service.js';
export { AssetStore } from './media/asset-store.js';
export {
  VideoComposer,
  run as runFfmpeg,
  probeDurationMs,
  workDirFor,
  renderSilentWav,
  renderSolidJpeg,
  FONTS_DIR,
  verifyMediaRuntime,
  type ComposeScene,
  type MovingComposeScene,
} from './render/compose.service.js';
export { GenerationService } from './generation/generation.service.js';
export { ImageGenerationService } from './image/image.service.js';
export { DubbingService } from './dubbing/dubbing.service.js';
export { RenderService } from './render/render.service.js';
export { ProviderRegistry, type ProviderStatusEntry, type ProviderCategory, type ProviderState } from './providers/registry.js';
export { FFmpegEngine } from './ffmpeg/ffmpeg.engine.js';
export type { RenderJobSpec, RenderJobResult, EncodingProfile, CaptionTrack, SubtitleTrack } from './types/render.types.js';
export { RenderJobSpecSchema, EncodingProfileSchema } from './schemas/render.schema.js';
