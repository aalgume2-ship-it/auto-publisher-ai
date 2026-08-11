import type { DbClient } from '@aca/database';
import { ChannelsService } from '../channels.service.js';
import { YouTubePublisher } from './youtube.publisher.js';
import { TikTokPublisher } from './tiktok.publisher.js';
import { InstagramPublisher } from './instagram.publisher.js';
import type { PublisherProvider } from './types.js';

export type { PublisherProvider, PublishInput, PublishResult } from './types.js';

export function createPublishers(prisma: DbClient, channels: ChannelsService): Map<string, PublisherProvider> {
  const map = new Map<string, PublisherProvider>();
  const yt = new YouTubePublisher(prisma, channels);
  const tt = new TikTokPublisher(channels);
  const ig = new InstagramPublisher(prisma, channels);
  map.set(yt.platform, yt);
  map.set(tt.platform, tt);
  map.set(ig.platform, ig);
  return map;
}

export function getPublisher(map: Map<string, PublisherProvider>, platform: string): PublisherProvider {
  const p = map.get(platform.toLowerCase());
  if (!p) throw new Error(`No publisher registered for platform: ${platform} — available: ${Array.from(map.keys()).join(', ')}`);
  return p;
}
