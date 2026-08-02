/**
 * Redis provider — ONE ioredis client per process (rate limits + cache
 * surfaces). Events has its own dedicated connection (packages/events); this
 * one belongs to the HTTP layer only.
 */
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { AppConfig } from '@aca/config';

export const REDIS = 'REDIS';
export const API_CONFIG = 'API_CONFIG';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  // AppConfig is an INTERFACE (erased at runtime — design:paramtypes emits
  // Object, never the API_CONFIG token): the token must be explicit or Nest
  // cannot resolve this dependency under ANY compiler.
  constructor(@Inject(API_CONFIG) config: AppConfig) {
    this.client = new Redis(config.redis.url, {
      keyPrefix: `${config.redis.prefix}:api:`,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}

export const redisProvider = {
  provide: REDIS,
  useFactory: (service: RedisService): Redis => service.client,
  inject: [RedisService],
};
