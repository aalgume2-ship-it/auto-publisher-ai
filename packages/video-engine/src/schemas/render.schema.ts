import { z } from 'zod';

export const EncodingProfileSchema = z.object({
  name: z.enum(['draft', 'standard', 'hd', 'master']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bitrate: z.string().regex(/^\d+[kmg]$/i), // e.g., "2500k"
  fps: z.number().int().min(1).max(60),
  preset: z.enum(['ultrafast', 'fast', 'medium', 'slow']),
});

export const CaptionTrackSchema = z.object({
  language: z.string(),
  text: z.string(),
  format: z.enum(['srt', 'vtt', 'ssa']),
  positioning: z.enum(['top', 'center', 'bottom']),
});

export const SubtitleTrackSchema = z.object({
  url: z.string().url().or(z.string().startsWith('/')),
  language: z.string(),
  format: z.enum(['srt', 'vtt', 'ass', 'ssa']),
  styling: z
    .object({
      fontFamily: z.string().optional(),
      fontSize: z.number().int().positive().optional(),
      fontColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
      outlineWidth: z.number().int().nonnegative().optional(),
      outlineColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    })
    .optional(),
});

export const RenderJobSpecSchema = z.object({
  videoId: z.string().uuid(),
  inputVideoUrl: z.string().url().or(z.string().startsWith('/')),
  outputBucketKey: z.string(),
  encodingProfile: EncodingProfileSchema,
  subtitles: SubtitleTrackSchema.array().optional(),
  captionTracks: CaptionTrackSchema.array().optional(),
  normalizeAudio: z.boolean().default(true),
  audioLufs: z.number().default(-14),
  overlayImageUrl: z.string().url().or(z.string().startsWith('/')).optional(),
  watermarkImageUrl: z.string().url().or(z.string().startsWith('/')).optional(),
  backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  specHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export type EncodingProfile = z.infer<typeof EncodingProfileSchema>;
export type RenderJobSpec = z.infer<typeof RenderJobSpecSchema>;
