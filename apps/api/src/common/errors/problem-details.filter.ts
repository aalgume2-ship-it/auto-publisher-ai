/**
 * ProblemDetailsFilter — THE single exit door for every error (ADR-025).
 *
 * Catch-all (@Catch() with no args): ApiError, zod issues arriving as
 * ApiError(pre-built), Nest HttpException (framework-raised: unknown route,
 * body-limit, unsupported media), Fastify content-type/parser errors, and
 * truly-unknown throwables. Output is ALWAYS RFC 9457 application/problem+json
 * with a platform `code`, `requestId` from the RequestContext, and never a
 * stack trace on the wire.
 *
 * Logging contract: 5xx unknowns get one error log with stack (ownership:
 * this filter); 4xx are logged at warn once here — the LoggingInterceptor
 * records lifecycle only.
 */
import { Catch, HttpException, Logger as NestLogger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { createLogger, type Logger } from '@aca/logger';
import {
  ErrorCodes,
  type ErrorCode,
  type ProblemDetails,
  problemTypeUri,
} from '@aca/shared';
import { ApiError, ERROR_STATUS, apiErrors } from './api-error.js';
import { maybeRequestContext } from '../context/request-context.js';

const ERROR_CODE_SET: ReadonlySet<string> = new Set(ErrorCodes);

/** Reverse of ERROR_STATUS' first match, for framework exceptions that carry only a status. */
const STATUS_TO_CODE: Readonly<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'NOT_FOUND',
  408: 'VALIDATION_FAILED',
  409: 'CONFLICT',
  413: 'VALIDATION_FAILED',
  415: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};

export function toProblem(exception: unknown, requestId: string): ProblemDetails {
  if (exception instanceof ApiError) {
    return exception.toProblem(requestId);
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    // framework bodies are {message, error, statusCode} or a raw string — extract a human title
    const title =
      typeof body === 'string'
        ? body
        : typeof body === 'object' && body !== null && 'message' in body
          ? Array.isArray((body as { message: unknown }).message)
            ? ((body as { message: string[] }).message[0] ?? exception.message)
            : String((body as { message: unknown }).message)
          : exception.message;
    const code = STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL' : 'VALIDATION_FAILED');
    // A framework exception may smuggle one of our codes (guards throw ApiError directly,
    // but Nest exceptions from our pipes can carry the code explicitly)
    const explicit =
      typeof body === 'object' && body !== null && 'code' in body && ERROR_CODE_SET.has(String((body as { code: unknown }).code))
        ? (String((body as { code: unknown }).code) as ErrorCode)
        : null;
    const finalCode = explicit ?? code;
    const problem: ProblemDetails = {
      type: problemTypeUri(finalCode),
      title,
      status: explicit !== null ? ERROR_STATUS[finalCode] : status,
      code: finalCode,
      requestId,
    };
    if (finalCode !== code || status < 500) problem.detail = title;
    return problem;
  }
  // unknown throwable → INTERNAL, never leaking internals
  return apiErrors.internal().toProblem(requestId);
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger = createLogger({ service: 'apps/api' })) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const ctx = maybeRequestContext();
    const requestId = ctx?.requestId ?? 'unscoped';

    const problem = toProblem(exception, requestId);

    if (problem.status >= 500 && !(exception instanceof ApiError)) {
      this.logger.error(
        { err: exception instanceof Error ? exception : undefined, requestId, code: problem.code, module: 'errors' },
        'http.unhandled_error',
      );
    } else if (problem.status >= 400) {
      this.logger.warn(
        { requestId, code: problem.code, status: problem.status, module: 'errors' },
        'http.client_error',
      );
    }

    void reply
      .code(problem.status)
      .header('content-type', 'application/problem+json')
      .send(problem);
  }
}
