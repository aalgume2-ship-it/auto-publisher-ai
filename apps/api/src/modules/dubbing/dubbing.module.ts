/** Dubbing module — real dubbing pipeline (queue: 'dubbing'). */
import { Module } from '@nestjs/common';
import { DubbingService, AiService, OrgCredentialsService } from '@aca/video-engine';
import { API_CONFIG } from '../../common/redis.provider.js';
import { PRISMA } from '../../common/prisma.provider.js';
import { DubbingController } from './dubbing.controller.js';
import { DubbingApiService } from './dubbing.service.js';

@Module({
  controllers: [DubbingController],
  providers: [
    DubbingApiService,
    {
      provide: DubbingService,
      useFactory: (config: unknown, prisma: unknown, ai: unknown) => new DubbingService(config as never, prisma as never, ai as never),
      inject: [API_CONFIG, PRISMA, AiService],
    },
    {
      provide: AiService,
      useFactory: (config: unknown, creds: unknown) => new AiService(config as never, creds as never),
      inject: [API_CONFIG, OrgCredentialsService],
    },
    {
      provide: OrgCredentialsService,
      useFactory: (config: unknown, prisma: unknown) => new OrgCredentialsService(config as never, prisma as never),
      inject: [API_CONFIG, PRISMA],
    },
  ],
  exports: [DubbingApiService],
})
export class DubbingModule {}
