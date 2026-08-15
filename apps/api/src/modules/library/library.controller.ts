/** LibraryController — unified library: videos / images / uploads / audio (real rows). */
import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { DbClient, Prisma } from '@aca/database';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { PRISMA } from '../../common/prisma.provider.js';
import { ApiError } from '../../common/errors/api-error.js';
import { rawMediaUrl } from '../videos/media.controller.js';

const OrgParams = z.object({ orgId: z.string().uuid() });

const LibraryQuery = z.object({
  type: z.enum(['videos', 'images', 'uploads', 'audio']).default('videos'),
  q: z.string().max(120).optional(),
  sort: z.enum(['newest', 'oldest', 'size']).default('newest'),
  status: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
});

type MediaRow = {
  id: string;
  kind: 'video' | 'image' | 'upload' | 'audio';
  title: string;
  status: string | null;
  mimeType: string | null;
  bytes: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  url: string | null;
  thumbUrl: string | null;
  createdAt: Date;
  meta: Record<string, unknown>;
};

@ApiTags('library')
@Controller({ path: 'organizations/:orgId', version: '1' })
export class LibraryController {
  constructor(
    @Inject(PRISMA) private readonly prisma: DbClient,
  ) {}

  @Get('library')
  @TenantRequired()
  @RequiresCapabilities('video.view')
  @UseZod({ params: OrgParams, query: LibraryQuery })
  @ApiOperation({ operationId: 'library', summary: 'Unified workspace library (real DB rows + signed media URLs)' })
  async library(
    @Param() params: { orgId: string },
    @Query() query: z.infer<typeof LibraryQuery>,
  ) {
    const mediaSecret = process.env.AUTH_JWT_SECRET ?? '';
    if (!mediaSecret) throw new ApiError('PLATFORM_ERROR', 'Misconfigured', { detail: 'AUTH_JWT_SECRET required' });
    const media = (key: string | null): string | null => (key ? rawMediaUrl(mediaSecret, key) : null);

    const rows: MediaRow[] = [];
    const order: 'desc' | 'asc' = query.sort === 'oldest' ? 'asc' : 'desc';

    if (query.type === 'videos') {
      const videos = await this.prisma.video.findMany({
        where: { orgId: params.orgId, ...(query.status ? { status: query.status as never } : {}) },
        orderBy: { createdAt: order },
        take: query.limit,
        skip: query.offset,
        include: { renditions: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 1 }, thumbnails: { take: 1 } },
      });
      for (const v of videos) {
        if (query.q && !`${v.title} ${v.description ?? ''}`.toLowerCase().includes(query.q.toLowerCase())) continue;
        const topRendition = v.renditions[0] ?? null;
        const topThumb = v.thumbnails[0] ?? null;
        rows.push({
          id: v.id, kind: 'video', title: v.title, status: v.status,
          mimeType: 'video/mp4',
          bytes: topRendition && topRendition.bytes !== null ? topRendition.bytes.toString() : null,
          width: 720, height: 1280,
          durationMs: v.durationMs,
          url: topRendition?.storageKey ? media(topRendition.storageKey) : null,
          thumbUrl: topThumb?.storageKey ? media(topThumb.storageKey) : null,
          createdAt: v.createdAt,
          meta: { seriesId: v.projectId },
        });
      }
    } else {
      const assets = await this.prisma.asset.findMany({
        where: this.typeFilter(query.type, params.orgId),
        orderBy: { createdAt: order },
        take: query.limit,
        skip: query.offset,
      });
      for (const a of assets) {
        const meta = (a.metadata ?? {}) as Record<string, unknown>;
        if (query.q && !`${a.sourceUrl ?? a.id} ${String(meta['prompt'] ?? '')}`.toLowerCase().includes(query.q.toLowerCase())) continue;
        rows.push({
          id: a.id,
          kind: query.type === 'audio' ? 'audio' : query.type === 'images' ? 'image' : 'upload',
          title: a.sourceUrl ?? `${a.type.toLowerCase()}-${a.id.slice(0, 8)}`,
          status: 'ready',
          mimeType: a.mimeType,
          bytes: a.bytes.toString(),
          width: a.width, height: a.height, durationMs: a.durationMs,
          url: media(a.storageKey),
          thumbUrl: a.type === 'IMAGE' ? media(a.storageKey) : null,
          createdAt: a.createdAt,
          meta: { tags: meta['tags'], folder: meta['folder'], prompt: meta['prompt'], provider: meta['provider'] },
        });
      }
    }

    // sort by size when requested
    if (query.sort === 'size') rows.sort((a, b) => Number(b.bytes ?? 0) - Number(a.bytes ?? 0));

    const total = query.type === 'videos'
      ? await this.prisma.video.count({ where: { orgId: params.orgId } })
      : await this.prisma.asset.count({ where: this.typeFilter(query.type, params.orgId) });

    return { items: rows, total, type: query.type };
  }

  private typeFilter(type: string, orgId: string): Prisma.AssetWhereInput {
    if (type === 'images') return { orgId, type: 'IMAGE', source: 'GENERATED' };
    if (type === 'audio') return { orgId, type: { in: ['AUDIO', 'MUSIC', 'VOICEOVER'] } };
    return { orgId, source: 'UPLOADED' };
  }
}
