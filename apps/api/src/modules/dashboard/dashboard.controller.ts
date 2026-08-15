/** DashboardController — real dashboard stats (no hardcoded numbers). */
import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { DbClient } from '@aca/database';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { PRISMA } from '../../common/prisma.provider.js';

const OrgParams = z.object({ orgId: z.string().uuid() });

@ApiTags('dashboard')
@Controller({ path: 'organizations/:orgId', version: '1' })
export class DashboardController {
  constructor(@Inject(PRISMA) private readonly prisma: DbClient) {}

  @Get('dashboard')
  @TenantRequired()
  @RequiresCapabilities('project.view')
  @UseZod({ params: OrgParams })
  @ApiOperation({ operationId: 'dashboard', summary: 'Workspace dashboard: real counts + recent activity from the database' })
  async dashboard(@Param() params: { orgId: string }) {
    const orgId = params.orgId;

    const [videoCounts, imageCount, uploadCount, audioCount, storageAgg, creditAgg, recentVideos, recentPublishes, scheduledPosts, channels, campaigns] =
      await Promise.all([
        this.prisma.video.groupBy({ by: ['status'], where: { orgId }, _count: { _all: true } }),
        this.prisma.asset.count({ where: { orgId, type: 'IMAGE' } }),
        this.prisma.asset.count({ where: { orgId, source: 'UPLOADED' } }),
        this.prisma.asset.count({ where: { orgId, type: { in: ['AUDIO', 'MUSIC', 'VOICEOVER'] } } }),
        this.prisma.asset.aggregate({ where: { orgId }, _sum: { bytes: true } }),
        this.prisma.aiCreditTransaction.aggregate({ where: { orgId }, _sum: { delta: true }, _count: { _all: true } }),
        this.prisma.video.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, take: 6 }),
        this.prisma.publishingTask.findMany({ where: { orgId, status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 5, include: { video: { select: { id: true, title: true } }, channel: { select: { platform: true, displayName: true } } } }),
        this.prisma.publishingTask.findMany({ where: { orgId, status: { in: ['SCHEDULED', 'QUEUED'] } }, orderBy: { scheduledAt: 'asc' }, take: 10, include: { video: { select: { id: true, title: true } }, channel: { select: { platform: true, displayName: true } } } }),
        this.prisma.channel.findMany({ where: { orgId }, select: { id: true, platform: true, displayName: true, status: true } }),
        this.prisma.campaign.findMany({ where: { orgId, status: 'ACTIVE' }, orderBy: { nextRunAt: 'asc' }, take: 10 }),
      ]);

    const counts = (s: string) => videoCounts.find((v) => v.status === s)?._count._all ?? 0;

    return {
      totals: {
        videos: counts('READY') + counts('PUBLISHED') + counts('GENERATING') + counts('QUEUED') + counts('FAILED') + counts('SCHEDULED'),
        videosReady: counts('READY'),
        videosGenerating: counts('GENERATING') + counts('QUEUED'),
        videosFailed: counts('FAILED'),
        published: counts('PUBLISHED'),
        scheduled: counts('SCHEDULED') + scheduledPosts.length,
        images: imageCount,
        uploads: uploadCount,
        audio: audioCount,
        storageBytes: storageAgg._sum.bytes?.toString() ?? '0',
        credits: creditAgg._sum.delta ?? 0,
      },
      recentGenerations: recentVideos.map((v) => ({ id: v.id, title: v.title, status: v.status, createdAt: v.createdAt })),
      recentPublications: recentPublishes.map((p) => ({ id: p.id, platform: p.channel.platform, channelName: p.channel.displayName, title: p.video.title, platformUrl: p.platformUrl, publishedAt: p.publishedAt })),
      scheduledPosts: scheduledPosts.map((p) => ({ id: p.id, platform: p.channel.platform, title: p.video.title, scheduledAt: p.scheduledAt })),
      channels: channels.map((c) => ({ id: c.id, platform: c.platform, displayName: c.displayName, status: c.status })),
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, platforms: c.platforms, nextRunAt: c.nextRunAt })),
    };
  }
}
