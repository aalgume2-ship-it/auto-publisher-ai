/** Providers module — provider registry status (masked, no secrets). */
import { Module } from '@nestjs/common';
import { ProviderRegistry, OrgCredentialsService } from '@aca/video-engine';
import { API_CONFIG } from '../../common/redis.provider.js';
import { PRISMA } from '../../common/prisma.provider.js';
import { ProvidersController } from './providers.controller.js';

@Module({
  controllers: [ProvidersController],
  providers: [
    {
      provide: OrgCredentialsService,
      useFactory: (config: unknown, prisma: unknown) => new OrgCredentialsService(config as never, prisma as never),
      inject: [API_CONFIG, PRISMA],
    },
    {
      provide: ProviderRegistry,
      useFactory: (config: unknown, creds: unknown) => new ProviderRegistry(config as never, creds as never),
      inject: [API_CONFIG, OrgCredentialsService],
    },
  ],
})
export class ProvidersModule {}
