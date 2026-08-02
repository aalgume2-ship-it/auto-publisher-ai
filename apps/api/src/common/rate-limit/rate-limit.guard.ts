/**
 * RateLimitGuard — wraps ALL routes (guard 6, runs after the chain so the
 * identity dimension is known). Routes pick a bucket with
 * `@RateLimit('oauthToken')`; unspecified routes use `default` (authenticated)
 * or `publicIp` (public). Mutations additionally consume the `mutations` bucket
 * (requirement: rate limiting on data-changing routes).
 *
 * Emits RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset on every
 * response and Retry-After on 429 (docs/API.md §1 conventions).
 */
import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { apiErrors } from '../errors/api-error.js';
import { requestContext } from '../context/request-context.js';
import {
  RATE_LIMIT_BUCKETS,
  rateLimitIdentity,
  slidingWindowVerdict,
  type RateLimitBucketName,
} from './rate-limit.js';
import { REDIS } from '../redis.provider.js';
import { IS_PUBLIC_KEY } from '../auth/auth.guard.js';

export const RATE_LIMIT_KEY = 'aca:rate-limit';
export const RateLimit = (bucket: RateLimitBucketName) => SetMetadata(RATE_LIMIT_KEY, bucket);

const MUTATION_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]) === true;
    const bucketName =
      this.reflector.getAllAndOverride<RateLimitBucketName>(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]) ??
      (isPublic ? 'publicIp' : 'default');

    const ctx = requestContext();
    const identity = rateLimitIdentity(ctx.principal, ctx.ip);

    await this.consume(bucketName, identity, reply);
    if (MUTATION_METHODS.has(req.method)) {
      await this.consume('mutations', identity, reply);
    }
    return true;
  }

  private async consume(bucketName: RateLimitBucketName, identity: string, reply: FastifyReply): Promise<void> {
    const bucket = RATE_LIMIT_BUCKETS[bucketName];
    const windowMs = bucket.windowSec * 1000;
    const nowMs = Date.now();
    const windowIndex = Math.floor(nowMs / windowMs);
    const currentKey = `rl:${bucketName}:${identity}:${windowIndex}`;
    const previousKey = `rl:${bucketName}:${identity}:${windowIndex - 1}`;

    // Connection-level failure rejects → INTERNAL via ProblemDetailsFilter (honest
    // 500 over silent fail-open: rate limits protect paid quota surfaces).
    const results = await this.redis
      .multi()
      .incr(currentKey)
      .pexpire(currentKey, windowMs * 2)
      .get(previousKey)
      .exec();
    if (results === null) throw apiErrors.internal();
    const [incrRes, , prevRes] = results;
    if (incrRes === undefined || incrRes[0] !== null) throw incrRes?.[0] ?? apiErrors.internal();
    if (prevRes !== undefined && prevRes[0] !== null) throw prevRes[0];

    const currentCount = Number(incrRes[1]);
    const previousCount = Number(prevRes?.[1] ?? 0);
    const verdict = slidingWindowVerdict({
      nowMs,
      windowMs,
      limit: bucket.limit,
      currentCount,
      previousCount,
    });

    reply.header('RateLimit-Limit', String(bucket.limit));
    reply.header('RateLimit-Remaining', String(verdict.remaining));
    reply.header('RateLimit-Reset', String(verdict.resetEpochSec));

    if (!verdict.allowed) {
      reply.header('Retry-After', String(verdict.retryAfterSec));
      throw apiErrors.rateLimited(verdict.retryAfterSec);
    }
  }
}
