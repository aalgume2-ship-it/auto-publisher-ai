import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VideoRenderProcessor } from './processors/video-render.processor.js';
import { AiAdapterModule } from './adapters/adapter.module.js';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    BullModule.registerQueue({
      name: 'video-render',
    }),
    AiAdapterModule
  ],
  providers: [VideoRenderProcessor],
})
export class WorkerModule {}
