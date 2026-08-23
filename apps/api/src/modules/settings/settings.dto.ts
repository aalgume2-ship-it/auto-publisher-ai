/** Settings module — zod contracts + swagger doc schemas. */
import { z } from 'zod';
import { LLM_PROVIDERS } from '../ai/providers.js';

export const OrgParamsSchema = z.object({ orgId: z.string().uuid() });
export const AiProviderParamsSchema = z.object({
  orgId: z.string().uuid(),
  provider: z.enum(LLM_PROVIDERS.map((p) => p.id) as [string, ...string[]]),
});
export const VideoProviderParamsSchema = z.object({
  orgId: z.string().uuid(),
  provider: z.enum(['runway', 'luma', 'fal-kling'] as [string, ...string[]]),
});
export const SaveAiKeyBodySchema = z.object({
  apiKey: z.string().min(8).max(512),
});
export const SaveBunnyStorageBodySchema = z.object({
  storageZone: z.string().min(2).max(128).regex(/^[a-zA-Z0-9-]+$/, 'invalid storage zone name'),
  accessKey: z.string().min(8).max(512),
  cdnHostname: z.string().min(4).max(255).regex(/^[a-zA-Z0-9.-]+$/, 'invalid CDN hostname'),
  storageEndpoint: z
    .string()
    .min(4)
    .max(255)
    .regex(/^(?:[a-zA-Z0-9-]+\.)?storage\.bunnycdn\.com$/, 'invalid Bunny storage endpoint')
    .optional(),
});
export const SaveGoogleOAuthBodySchema = z.object({
  // real Google OAuth web client IDs end with .apps.googleusercontent.com
  clientId: z.string().min(10).max(512).regex(/\.apps\.googleusercontent\.com$/, 'clientId must end with .apps.googleusercontent.com'),
  clientSecret: z.string().min(10).max(256),
});
export const SaveTikTokOAuthBodySchema = z.object({
  clientKey: z.string().min(4).max(128),
  clientSecret: z.string().min(8).max(512),
});

export const AiProviderItemDoc = {
  type: 'object' as const,
  properties: {
    id: { type: 'string', enum: LLM_PROVIDERS.map((p) => p.id) },
    label: { type: 'string' },
    model: { type: 'string' },
    free: { type: 'boolean' },
    consoleUrl: { type: 'string' },
    configured: { type: 'boolean' },
    source: { type: 'string', nullable: true, enum: ['org', 'env', null] },
    hint: { type: 'string', nullable: true, description: 'masked key ending, never the secret itself' },
    validatedAt: { type: 'string', format: 'date-time', nullable: true },
    active: { type: 'boolean', description: 'this is the credential the script stage will actually use' },
  },
};

export const IntegrationsDoc = {
  type: 'object' as const,
  properties: {
    ai: {
      type: 'object',
      properties: {
        active: { type: 'object', nullable: true, properties: { provider: { type: 'string' }, source: { type: 'string', enum: ['org', 'env'] } } },
        items: { type: 'array', items: AiProviderItemDoc },
      },
    },
    youtube: {
      type: 'object',
      properties: {
        configured: { type: 'boolean' },
        source: { type: 'string', nullable: true, enum: ['org', 'env', null] },
        hint: { type: 'string', nullable: true },
        redirectUri: { type: 'string', description: 'register this exact URI in Google Cloud Console' },
      },
    },
    tiktok: {
      type: 'object',
      properties: {
        configured: { type: 'boolean' },
        source: { type: 'string', nullable: true, enum: ['org', 'env', null] },
        hint: { type: 'string', nullable: true },
        redirectUri: { type: 'string', description: 'register this exact URI in TikTok Developers' },
      },
    },
  },
};

export const SavedIntegrationDoc = {
  type: 'object' as const,
  properties: {
    ok: { type: 'boolean' },
    provider: { type: 'string' },
    hint: { type: 'string' },
    validatedAt: { type: 'string', format: 'date-time' },
  },
};
