/** ProvidersController — provider registry status (configured/not_configured/error).
 *  NEVER returns keys — only masked hints + env key names. */
import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { ProviderRegistry } from '@aca/video-engine';

const OrgParams = z.object({ orgId: z.string().uuid() });

@ApiTags('providers')
@Controller({ path: 'organizations/:orgId', version: '1' })
export class ProvidersController {
  constructor(private readonly registry: ProviderRegistry) {}

  @Get('providers/status')
  @TenantRequired()
  @RequiresCapabilities('project.view')
  @UseZod({ params: OrgParams })
  @ApiOperation({ operationId: 'providerStatus', summary: 'Provider registry status — configured / not_configured / error (masked hints only)' })
  status(@Param() params: { orgId: string }) {
    return this.registry.status(params.orgId);
  }
}
