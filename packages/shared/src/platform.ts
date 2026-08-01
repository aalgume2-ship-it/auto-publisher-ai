/**
 * Platform registry contracts (ADR-022): platform ids are DATA, not a DB enum —
 * publisher plugins register new platform ids without schema/core changes.
 */
import { z } from 'zod';

export const PLATFORM_ID_REGEX = /^[a-z][a-z0-9-]{1,31}$/;

export const CorePlatformIds = [
  'youtube',
  'tiktok',
  'instagram',
  'facebook',
  'x',
  'linkedin',
  'snapchat',
] as const;

export type CorePlatformId = (typeof CorePlatformIds)[number];

export const PlatformIdSchema = z
  .string()
  .regex(PLATFORM_ID_REGEX, 'platform id must be kebab-case, 2-32 chars, start with a letter');

export interface PlatformOAuthDescriptor {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  pkce: 'required' | 'optional' | 'none';
  /** Where/how to resolve the connected channel's platform id + profile after token exchange. */
  channelInfoPath?: string;
}

export interface PlatformRef {
  id: string; // registry id (satisfies PlatformIdSchema)
  displayName: string;
  origin: { kind: 'core' } | { kind: 'plugin'; pluginId: string };
  capabilities: Array<'upload' | 'scheduled_upload' | 'analytics' | 'comments' | 'draft_handoff'>;
  brandColor?: string; // UI hint
  oauth?: PlatformOAuthDescriptor;
  maxPostsPerDay?: number; // quota service hint
}

export function isCorePlatform(id: string): id is CorePlatformId {
  return (CorePlatformIds as readonly string[]).includes(id);
}

/* ------------------------------------------------------------------ */
/* Core platform registry (Database.md §7: "registry lives in           */
/* @aca/shared, not DDL"). Publisher plugins may ADD entries at         */
/* runtime with origin {kind:'plugin'} — core ids below are always on.  */
/* OAuth descriptors use the vendors' documented, stable endpoints.     */
/* ------------------------------------------------------------------ */

export const CorePlatformRegistry: readonly PlatformRef[] = [
  {
    id: 'youtube',
    displayName: 'YouTube',
    origin: { kind: 'core' },
    capabilities: ['upload', 'scheduled_upload', 'analytics', 'comments'],
    brandColor: '#FF0000',
    oauth: {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
      ],
      pkce: 'optional',
      channelInfoPath:
        'GET https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    },
    // Default Data API quota (10k units/day) ÷ video insert cost (1600 units).
    maxPostsPerDay: 6,
  },
  {
    id: 'tiktok',
    displayName: 'TikTok',
    origin: { kind: 'core' },
    capabilities: ['upload', 'analytics'],
    brandColor: '#000000',
    oauth: {
      authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
      tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
      scopes: ['user.info.basic', 'video.upload', 'video.publish'],
      pkce: 'required',
      channelInfoPath:
        'GET https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count',
    },
    maxPostsPerDay: 15,
  },
  {
    id: 'instagram',
    displayName: 'Instagram',
    origin: { kind: 'core' },
    capabilities: ['upload', 'analytics', 'comments'],
    brandColor: '#E4405F',
    oauth: {
      authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
      scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'business_management'],
      pkce: 'optional',
      channelInfoPath:
        'GET https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account{username,profile_picture_url,followers_count}',
    },
    // Content Publishing API: 25 API-published posts per rolling 24h.
    maxPostsPerDay: 25,
  },
  {
    id: 'facebook',
    displayName: 'Facebook',
    origin: { kind: 'core' },
    capabilities: ['upload', 'analytics', 'comments'],
    brandColor: '#1877F2',
  },
  {
    id: 'x',
    displayName: 'X (Twitter)',
    origin: { kind: 'core' },
    capabilities: ['upload', 'analytics'],
    brandColor: '#000000',
  },
  {
    id: 'linkedin',
    displayName: 'LinkedIn',
    origin: { kind: 'core' },
    capabilities: ['upload', 'analytics'],
    brandColor: '#0A66C2',
  },
  {
    id: 'snapchat',
    displayName: 'Snapchat',
    origin: { kind: 'core' },
    capabilities: ['upload', 'analytics'],
    brandColor: '#FFFC00',
  },
];

export function getPlatformDescriptor(id: string): PlatformRef | undefined {
  return CorePlatformRegistry.find((p) => p.id === id);
}

export function platformWithOAuth(id: string): (PlatformRef & { oauth: PlatformOAuthDescriptor }) | undefined {
  const p = getPlatformDescriptor(id);
  return p?.oauth === undefined ? undefined : (p as PlatformRef & { oauth: PlatformOAuthDescriptor });
}
