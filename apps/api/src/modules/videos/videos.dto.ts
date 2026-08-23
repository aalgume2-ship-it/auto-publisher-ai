/** Videos module — zod contracts + swagger doc schemas. */
import { z } from 'zod';

export const OrgParamsSchema = z.object({ orgId: z.string().uuid() });
export const SeriesParamsSchema = z.object({ orgId: z.string().uuid(), seriesId: z.string().uuid() });
export const VideoParamsSchema = z.object({ orgId: z.string().uuid(), videoId: z.string().uuid() });
export const AssetParamsSchema = z.object({ orgId: z.string().uuid(), assetId: z.string().uuid() });
export const TaskParamsSchema = z.object({ orgId: z.string().uuid(), taskId: z.string().uuid() });

export const CreateSeriesBody = z.object({
  name: z.string().min(2).max(120),
  niche: z.string().min(2).max(80).default('معرفة وحقائق'),
  language: z.string().min(2).max(8).default('ar'),
  description: z.string().max(500).optional(),
});
export type CreateSeriesBody = z.infer<typeof CreateSeriesBody>;
export const CreateSeriesBodyDoc = {
  type: 'object' as const,
  required: ['name'],
  properties: {
    name: { type: 'string', example: 'حقائق لا تعرفها' },
    niche: { type: 'string', example: 'معرفة وحقائق' },
    language: { type: 'string', example: 'ar' },
    description: { type: 'string' },
  },
};

export const GenerateVideoBody = z
  .object({
    // Studio accepts full story prompts (up to 2,000 characters). Keep the
    // public API contract aligned so a prompt accepted by the composer cannot
    // be rejected only after the user starts generation.
    keyword: z.string().min(3).max(2_000),
    // Old cached Studio builds still submit 45 seconds. Treat that legacy
    // choice as the new canonical 40-second story so production remains
    // correct while the updated frontend propagates through its CDN.
    targetSeconds: z.number().int().min(20).max(60).default(40).transform((seconds) => (seconds === 45 ? 40 : seconds)),
    publishNow: z.boolean().default(false),
    channelId: z.string().uuid().optional(),
  })
  .refine((v) => !v.publishNow || v.channelId, { message: 'channelId is required when publishNow=true' });
export type GenerateVideoBody = z.infer<typeof GenerateVideoBody>;
export const GenerateVideoBodyDoc = {
  type: 'object' as const,
  required: ['keyword'],
  properties: {
    keyword: { type: 'string', example: 'حقائق مدهشة عن الفضاء والثقوب السوداء' },
    targetSeconds: { type: 'integer', example: 40 },
    publishNow: { type: 'boolean', example: false },
    channelId: { type: 'string', format: 'uuid' },
  },
};

export const ScheduleBody = z.object({
  channelId: z.string().uuid(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});
export type ScheduleBody = z.infer<typeof ScheduleBody>;
export const ScheduleBodyDoc = {
  type: 'object' as const,
  required: ['channelId'],
  properties: {
    channelId: { type: 'string', format: 'uuid' },
    scheduledAt: { type: 'string', format: 'date-time', description: 'omit → publish immediately' },
  },
};

export const PresignUploadBody = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(3).max(80),
  kind: z.enum(['IMAGE', 'VIDEO_CLIP', 'AUDIO', 'BRAND']).default('IMAGE'),
  sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024 * 1024).optional(),
});

export const ConfirmS3Body = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(3).max(80),
  kind: z.enum(['IMAGE', 'VIDEO_CLIP', 'AUDIO', 'BRAND']).default('IMAGE'),
  storageKey: z.string().trim().min(3).max(500),
  bytes: z.number().int().min(1).max(5 * 1024 * 1024 * 1024),
});

export const UploadAssetBody = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(3).max(80),
  kind: z.enum(['IMAGE', 'VIDEO_CLIP', 'AUDIO', 'BRAND']).default('IMAGE'),
  folder: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
  base64: z.string().min(16).max(90_000_000),
});
export type UploadAssetBody = z.infer<typeof UploadAssetBody>;

export const UploadAssetBodyDoc = {
  type: 'object' as const,
  required: ['fileName', 'mimeType', 'base64'],
  properties: {
    fileName: { type: 'string', example: 'brand-logo.png' },
    mimeType: { type: 'string', example: 'image/png' },
    kind: { type: 'string', enum: ['IMAGE', 'VIDEO_CLIP', 'AUDIO', 'BRAND'], example: 'IMAGE' },
    folder: { type: 'string', example: 'summer-campaign' },
    tags: { type: 'array', items: { type: 'string' }, example: ['brand', 'featured', 'hero'] },
    base64: { type: 'string', example: 'iVBORw0KGgoAAAANSUhEUgAA...' },
  },
};

export const UpdateAssetMetaBody = z.object({
  folder: z.string().trim().min(1).max(120).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'at least one field is required');
export type UpdateAssetMetaBody = z.infer<typeof UpdateAssetMetaBody>;

export const UpdateAssetMetaBodyDoc = {
  type: 'object' as const,
  properties: {
    folder: { type: 'string', nullable: true, example: 'summer-campaign' },
    tags: { type: 'array', items: { type: 'string' }, example: ['brand', 'featured'] },
  },
};

export const AssetListQuerySchema = z.object({
  kind: z.enum(['IMAGE', 'VIDEO_CLIP', 'AUDIO', 'BRAND']).optional(),
  folder: z.string().trim().min(1).max(120).optional(),
  tag: z.string().trim().min(1).max(32).optional(),
  q: z.string().trim().min(1).max(120).optional(),
});
export type AssetListQuery = z.infer<typeof AssetListQuerySchema>;

export const VideoListQuerySchema = z.object({
  seriesId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'QUEUED', 'GENERATING', 'RENDERING', 'UPLOADING', 'READY', 'SCHEDULED', 'PUBLISHED', 'FAILED']).optional(),
});

export const SeriesDoc = {
  type: 'object' as const,
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    niche: { type: 'string' },
    language: { type: 'string' },
    targetPlatforms: { type: 'array', items: { type: 'string' } },
    counts: { type: 'object' as const, properties: { videos: { type: 'integer' } } },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const AssetDoc = {
  type: 'object' as const,
  properties: {
    id: { type: 'string', format: 'uuid' },
    kind: { type: 'string', enum: ['IMAGE', 'VIDEO_CLIP', 'AUDIO', 'BRAND'] },
    mimeType: { type: 'string', example: 'image/png' },
    fileName: { type: 'string', example: 'brand-logo.png' },
    folder: { type: 'string', nullable: true, example: 'summer-campaign' },
    tags: { type: 'array', items: { type: 'string' }, example: ['brand', 'featured'] },
    bytes: { type: 'string', example: '24813' },
    url: { type: 'string', example: '/v1/media/raw?...' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};
