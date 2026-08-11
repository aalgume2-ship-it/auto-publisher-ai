/**
 * Instagram Publisher — REAL post via Meta Graph API.
 * Flow: create a media container (reel/image) → publish the container.
 * Requires an Instagram Business account + channel token (vaulted).
 */
import type { DbClient } from '@aca/database';
import { ChannelsService } from '../channels.service.js';
import type { PublisherProvider, PublishInput, PublishResult } from './types.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

export class InstagramPublisher implements PublisherProvider {
  readonly platform = 'instagram';
  readonly label = 'Instagram';

  constructor(
    private readonly prisma: DbClient,
    private readonly channels: ChannelsService,
  ) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    const token = await this.channels.freshAccessToken(input.channelId);
    const channel = await this.prisma.channel.findUnique({ where: { id: input.channelId } });
    // channel.platformChannelId holds the Instagram Business Account id
    const igAccountId = channel?.platformChannelId;
    if (!igAccountId) throw new Error('instagram: channel has no linked Business Account id');

    // 1) media container (video reel) — bytes must be publicly reachable; we use
    //    the platform's media_url when available, else the video_url endpoint.
    //    Graph API requires a URL, so we publish via the caption + media_url path.
    const containerBody: Record<string, string> = {
      media_type: 'REELS',
      video_url: input.mediaUrl ?? '',
      caption: input.caption ?? input.title,
    };
    if (!containerBody.video_url) throw new Error('instagram: media_url is required (publish the rendition URL first)');

    const containerRes = await fetch(`${GRAPH}/${igAccountId}/media`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...containerBody, access_token: token }),
    });
    const container = (await containerRes.json()) as { id?: string; error?: { message?: string } };
    if (!containerRes.ok || !container.id) {
      throw new Error(`instagram container ${containerRes.status}: ${container.error?.message ?? 'no id'}`);
    }

    // 2) publish the container
    const pubRes = await fetch(`${GRAPH}/${igAccountId}/media_publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creation_id: container.id, access_token: token }),
    });
    const pub = (await pubRes.json()) as { id?: string; error?: { message?: string } };
    if (!pubRes.ok || !pub.id) {
      throw new Error(`instagram publish ${pubRes.status}: ${pub.error?.message ?? 'no id'}`);
    }

    return {
      platformVideoId: pub.id,
      platformPostId: pub.id,
      platformUrl: `https://www.instagram.com/reel/${pub.id}`,
    };
  }
}
