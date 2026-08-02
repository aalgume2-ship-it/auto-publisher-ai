/**
 * LoggingInterceptor — one structured completion line per request (pino via
 * @aca/logger). Error DETAILS belong to ProblemDetailsFilter (it logs 5xx with
 * stack); this layer records lifecycle facts only.
 *
 * Health/live/metrics endpoints are recorded at debug level to keep the hot
 * path signal-dense (they are polled constantly by orchestrators).
 */
import { Injectable, Optional, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createLogger, type Logger } from '@aca/logger';
import { maybeRequestContext } from '../context/request-context.js';

const QUIET_ROUTES = new Set(['/health', '/health/live', '/health/ready', '/metrics']);

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(@Optional() private readonly logger: Logger = createLogger({ service: 'apps/api' })) {}

  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const started = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.logLine(req, reply, started, null),
        error: (err: unknown) => this.logLine(req, reply, started, err),
      }),
    );
  }

  private logLine(req: FastifyRequest, reply: FastifyReply, started: bigint, err: unknown): void {
    const ctx = maybeRequestContext();
    const route = req.routeOptions?.url ?? 'unmatched';
    const fields = {
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
      organizationId: ctx?.organizationId ?? undefined,
      userId: ctx?.userId ?? undefined,
      method: req.method,
      route,
      status: reply.statusCode,
      durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
      ...(err instanceof Error ? { err } : {}),
    };
    const log = this.logger.child({ module: 'http' });
    if (QUIET_ROUTES.has(route)) {
      log.debug(fields, 'http.request.completed');
    } else {
      log.info(fields, 'http.request.completed');
    }
  }
}
