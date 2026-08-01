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
