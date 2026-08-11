/**
 * Publisher Provider abstraction — each platform implements this interface.
 * The publish queue delegates to the correct provider by `channel.platform`.
 * Adding Instagram/Facebook/etc. is a new file implementing this interface,
 * registered in publishers/index.ts — no core rebuild.
 */

export interface PublishInput {
  channelId: string;
  orgId: string;
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  privacy: string; // 'public' | 'private' | 'unlisted' ...
  videoBytes: Buffer;
  thumbnailBytes?: Buffer | null;
  /** TikTok caption etc. */
  caption?: string;
  /** Public URL of the media (Instagram Graph API requires a URL) */
  mediaUrl?: string;
}

export interface PublishResult {
  platformVideoId: string | null;
  platformUrl: string | null;
  platformPostId?: string | null;
  raw?: unknown;
}

export interface PublisherProvider {
  readonly platform: string; // 'youtube' | 'tiktok' | ...
  /** Human label for errors/logs */
  readonly label: string;
  /** Upload + publish. Throws on failure — caller marks task FAILED. */
  publish(input: PublishInput): Promise<PublishResult>;
  /** Fetch channel profile using stored tokens — used during OAuth callback */
  // channel linking is handled in ChannelsService, not here
}
