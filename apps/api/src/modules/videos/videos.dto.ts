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
    keyword: z.string().min(3).max(160),
    targetSeconds: z.number().int().min(20).max(60).default(45),
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
    targetSeconds: { type: 'integer', example: 45 },
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

export const VideoListQuerySchema = z.object({
  seriesId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'QUEUED', 'GENERATING', 'READY', 'SCHEDULED', 'PUBLISHED', 'FAILED']).optional(),
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
