/**
 * Frozen contract C6 — Publisher (docs/Contracts.md).
 * One adapter per platform registry id (ADR-022 — platform ids are data, so
 * publisher plugins can add platforms without core/schema changes).
 * Adapters resolve `VaultRef` → decrypted oauth tokens INSIDE the adapter
 * boundary (KMS envelope vault); secrets never enter core.
 */
import { z } from 'zod';

/** Opaque reference into the token vault (provider_credentials row key). Never the secret itself. */
export type VaultRef = string;

export const PublishVideoInputSchema = z.object({
  /** Storage key of the final rendered container (IStoragePort space). */
  videoKey: z.string().min(1).max(1024),
  durationMs: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.enum(['video/mp4', 'video/quicktime', 'video/webm']),
  /** Optional sidecar captions (SRT/VTT storage key) for platforms supporting them. */
  captionsKey: z.string().min(1).max(1024).optional(),
});
export type PublishVideoInput = z.infer<typeof PublishVideoInputSchema>;

/**
 * Normalized cross-platform metric bag. Any field MAY be absent per platform
 * capability — consumers must handle missing fields, adapters must not invent them.
 */
export const PlatformMetricsSchema = z.object({
  /** Registry id (ADR-022) the numbers belong to. */
  platform: z.string().min(1).max(32),
  fetchedAt: z.string().datetime({ offset: false }),
  views: z.number().int().nonnegative().optional(),
  likes: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  shares: z.number().int().nonnegative().optional(),
  saves: z.number().int().nonnegative().optional(),
  watchTimeMs: z.number().int().nonnegative().optional(),
  avgViewDurationMs: z.number().int().nonnegative().optional(),
  /** Click-through rate 0..1 (impression-based), where the platform exposes it. */
  ctr: z.number().min(0).max(1).optional(),
  followersTotal: z.number().int().nonnegative().optional(),
  followersGained: z.number().int().nonnegative().optional(),
});
export type PlatformMetrics = z.infer<typeof PlatformMetricsSchema>;

/* ------------------------------------------------------------------ */
/* Client interface (C6)                                               */
/* ------------------------------------------------------------------ */

export interface IPublisherClient {
  /** Platform registry id (ADR-022), e.g. "youtube", or plugin-registered id. */
  readonly platform: string;

  fetchChannelProfile(credential: VaultRef): Promise<{
    platformChannelId: string;
    displayName: string;
    handle?: string;
    avatarUrl?: string;
    followers?: bigint;
  }>;

  publish(task: {
    video: PublishVideoInput;
    channel: VaultRef;
    scheduledAt?: string;
    title: string;
    description?: string;
    hashtags: string[];
    thumbnailKey?: string;
    /** YouTube/TikTok altered-content disclosure flag — set from project policy. */
    aiDisclosure: boolean;
  }): Promise<{
    platformVideoId: string;
    platformUrl: string;
    platformPostId?: string;
    scheduled: boolean;
  }>;

  fetchVideoMetrics(ref: {
    credential: VaultRef;
    platformVideoId: string;
  }): Promise<PlatformMetrics>;

  fetchChannelMetrics(credential: VaultRef, sinceDays: number): Promise<PlatformMetrics>;

  quotas(credential: VaultRef): Promise<{ remainingToday?: number; resetsAt?: string }>;
}
