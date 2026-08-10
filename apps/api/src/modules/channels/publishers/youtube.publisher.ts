/**
 * YouTube Publisher — real resumable upload via Google Upload API.
 * Uses the vaulted OAuth token (auto-refreshed) for the channel.
 */
import type { DbClient } from '@aca/database';
import { ChannelsService } from '../channels.service.js';
import type { PublisherProvider, PublishInput, PublishResult } from './types.js';

const UPLOAD_INIT = 'https://upload.googleapis.com/upload/youtube/v3/videos';

export class YouTubePublisher implements PublisherProvider {
  readonly platform = 'youtube';
  readonly label = 'YouTube';

  constructor(
    private readonly prisma: DbClient,
    private readonly channels: ChannelsService,
  ) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    const token = await this.channels.freshAccessToken(input.channelId);
    // 1) initiate resumable session
    const init = await fetch(`${UPLOAD_INIT}?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': 'video/mp4',
        'x-upload-content-length': String(input.videoBytes.byteLength),
      },
      body: JSON.stringify({
        snippet: {
          title: input.title,
          description: input.description ?? '',
          tags: input.tags,
          categoryId: '22',
        },
        status: { privacyStatus: input.privacy ?? 'public', selfDeclaredMadeForKids: false },
      }),
    });
    const sessionUri = init.headers.get('location');
    if (init.status !== 200 || !sessionUri) {
      throw new Error(`youtube upload session ${init.status}: ${(await init.text()).slice(0, 300)}`);
    }
    // 2) upload bytes
    const put = await fetch(sessionUri, {
      method: 'PUT',
      headers: { 'content-type': 'video/mp4', 'content-length': String(input.videoBytes.byteLength) },
      body: new Uint8Array(input.videoBytes),
    });
    const putBody = (await put.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null;
    if (put.status !== 200 && put.status !== 201) {
      throw new Error(`youtube upload ${put.status}: ${putBody?.error?.message ?? 'upload failed'}`);
    }
    const platformVideoId = putBody?.id ?? null;
    return {
      platformVideoId,
      platformUrl: platformVideoId ? `https://youtu.be/${platformVideoId}` : null,
    };
  }
}
