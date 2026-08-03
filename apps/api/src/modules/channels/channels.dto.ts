/** Channels module — zod contracts + swagger doc schemas (API.md thin-rule). */
import { z } from 'zod';

export const OrgParamsSchema = z.object({ orgId: z.string().uuid() });
export const ChannelParamsSchema = z.object({ orgId: z.string().uuid(), channelId: z.string().uuid() });
export const OauthCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

export const ChannelDoc = {
  type: 'object' as const,
  properties: {
    id: { type: 'string', format: 'uuid' },
    platform: { type: 'string', example: 'youtube' },
    platformChannelId: { type: 'string', example: 'UC_x5XG1OV2P6uZZ5FSM9Ttw' },
    displayName: { type: 'string', example: 'قناة نور' },
    handle: { type: 'string', nullable: true, example: '@noor' },
    avatarUrl: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['CONNECTED', 'TOKEN_EXPIRED', 'REVOKED', 'SYNC_ERROR', 'DISCONNECTED'] },
    scopes: { type: 'array', items: { type: 'string' } },
    followers: { type: 'string', nullable: true },
    connectedAt: { type: 'string', format: 'date-time' },
  },
};

export const ChannelListDoc = { type: 'object' as const, properties: { items: { type: 'array', items: ChannelDoc } } };

export const YoutubeLinkDoc = {
  type: 'object' as const,
  required: ['authorizeUrl'],
  properties: {
    authorizeUrl: { type: 'string', description: 'Google consent screen URL — send the user there (10 min state window)' },
    expiresInSec: { type: 'integer', example: 600 },
  },
};
