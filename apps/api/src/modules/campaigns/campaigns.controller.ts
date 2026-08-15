/** CampaignsController — brand workspaces automation: campaigns + calendar. */
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { requestContext } from '../../common/context/request-context.js';
import { CampaignsService } from './campaigns.service.js';

const OrgParams = z.object({ orgId: z.string().uuid() });
const CampaignParams = z.object({ orgId: z.string().uuid(), campaignId: z.string().uuid() });

export const CreateCampaignBody = z.object({
  name: z.string().min(2).max(120),
  platforms: z.array(z.enum(['youtube', 'tiktok', 'instagram'])).min(1).max(3),
  cadence: z.enum(['daily', 'weekly', 'custom']).default('daily'),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('18:00'),
  timezone: z.string().default('UTC'),
  contentMode: z.enum(['auto', 'manual']).default('auto'),
  referenceImageIds: z.array(z.string().uuid()).max(10).default([]),
  config: z
    .object({
      captions: z.enum(['ai', 'manual']).default('ai'),
      hashtags: z.enum(['ai', 'manual']).default('ai'),
      voice: z.string().optional(),
      imageStyle: z.string().optional(),
      videoStyle: z.string().optional(),
    })
    .default({}),
});

export const UpdateCampaignBody = CreateCampaignBody.partial();

export const CalendarQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.string().optional(),
});

@ApiTags('campaigns')
@Controller({ path: 'organizations/:orgId', version: '1' })
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post('campaigns')
  @HttpCode(201)
  @TenantRequired()
  @RequiresCapabilities('project.create')
  @UseZod({ params: OrgParams, body: CreateCampaignBody })
  @ApiOperation({ operationId: 'createCampaign', summary: 'Create an automated campaign (schedule → generate → publish)' })
  create(@Param() params: { orgId: string }, @Body() body: z.infer<typeof CreateCampaignBody>) {
    const ctx = requestContext();
    return this.campaigns.create(params.orgId, body, ctx.userId);
  }

  @Get('campaigns')
  @TenantRequired()
  @RequiresCapabilities('project.view')
  @UseZod({ params: OrgParams })
  @ApiOperation({ operationId: 'listCampaigns', summary: 'Campaigns of the workspace' })
  list(@Param() params: { orgId: string }) {
    return this.campaigns.list(params.orgId);
  }

  @Get('campaigns/:campaignId')
  @TenantRequired()
  @RequiresCapabilities('project.view')
  @UseZod({ params: CampaignParams })
  @ApiOperation({ operationId: 'getCampaign', summary: 'Campaign detail with its posts' })
  get(@Param() params: { orgId: string; campaignId: string }) {
    return this.campaigns.get(params.orgId, params.campaignId);
  }

  @Patch('campaigns/:campaignId')
  @TenantRequired()
  @RequiresCapabilities('project.edit')
  @UseZod({ params: CampaignParams, body: UpdateCampaignBody })
  @ApiOperation({ operationId: 'updateCampaign', summary: 'Update campaign settings' })
  update(@Param() params: { orgId: string; campaignId: string }, @Body() body: z.infer<typeof UpdateCampaignBody>) {
    return this.campaigns.update(params.orgId, params.campaignId, body);
  }

  @Post('campaigns/:campaignId/run')
  @HttpCode(202)
  @TenantRequired()
  @RequiresCapabilities('project.edit')
  @UseZod({ params: CampaignParams })
  @ApiOperation({ operationId: 'runCampaign', summary: 'Trigger the campaign pipeline now (generation jobs enqueued)' })
  run(@Param() params: { orgId: string; campaignId: string }) {
    return this.campaigns.runNow(params.orgId, params.campaignId);
  }

  @Delete('campaigns/:campaignId')
  @TenantRequired()
  @RequiresCapabilities('project.edit')
  @UseZod({ params: CampaignParams })
  @ApiOperation({ operationId: 'deleteCampaign', summary: 'Delete a campaign (keeps produced posts)' })
  async remove(@Param() params: { orgId: string; campaignId: string }) {
    await this.campaigns.remove(params.orgId, params.campaignId);
    return { ok: true };
  }

  @Get('calendar')
  @TenantRequired()
  @RequiresCapabilities('project.view')
  @UseZod({ params: OrgParams, query: CalendarQuery })
  @ApiOperation({ operationId: 'calendar', summary: 'Calendar events: campaign posts + scheduled publishes' })
  calendar(@Param() params: { orgId: string }, @Query() query: z.infer<typeof CalendarQuery>) {
    return this.campaigns.calendar(params.orgId, query);
  }
}
