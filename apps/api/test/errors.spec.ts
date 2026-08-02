import { describe, expect, it } from 'vitest';
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { ERROR_STATUS, ApiError, apiErrors } from '../src/common/errors/api-error.js';
import { toProblem } from '../src/common/errors/problem-details.filter.js';
import { ErrorCodes, problemTypeUri } from '@aca/shared';

const REQUEST_ID = '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55';

describe('ERROR_STATUS mapping table', () => {
  it('covers EVERY catalog code exactly once (append-only guard)', () => {
    expect(Object.keys(ERROR_STATUS).sort()).toEqual([...ErrorCodes].sort());
  });

  it('every status is a valid HTTP error status', () => {
    for (const [code, status] of Object.entries(ERROR_STATUS)) {
      expect(status, code).toBeGreaterThanOrEqual(400);
      expect(status, code).toBeLessThan(600);
    }
  });

  it('TENANT_VIOLATION is masked as 404 (cross-tenant oracle defense)', () => {
    expect(ERROR_STATUS.TENANT_VIOLATION).toBe(404);
  });
});

describe('toProblem — RFC 9457 rendering', () => {
  it('renders ApiError with type/title/status/code/requestId (+detail/meta)', () => {
    const p = toProblem(
      new ApiError('CREDIT_INSUFFICIENT', 'Insufficient AI Credits', {
        detail: 'operation requires 500 credits; 20 available',
        meta: { required: 500, available: 20 },
      }),
      REQUEST_ID,
    );
    expect(p).toEqual({
      type: problemTypeUri('CREDIT_INSUFFICIENT'),
      title: 'Insufficient AI Credits',
      status: 402,
      code: 'CREDIT_INSUFFICIENT',
      requestId: REQUEST_ID,
      detail: 'operation requires 500 credits; 20 available',
      meta: { required: 500, available: 20 },
    });
  });

  it('maps framework 404 (unknown route) to NOT_FOUND problem', () => {
    const p = toProblem(new NotFoundException('Cannot GET /v1/nope'), REQUEST_ID);
    expect(p.code).toBe('NOT_FOUND');
    expect(p.status).toBe(404);
    expect(p.requestId).toBe(REQUEST_ID);
  });

  it('maps framework 400 to VALIDATION_FAILED', () => {
    const p = toProblem(new BadRequestException('bad body'), REQUEST_ID);
    expect(p.code).toBe('VALIDATION_FAILED');
    expect(p.status).toBe(400);
  });

  it('honors an explicit platform code smuggled in an HttpException body', () => {
    const p = toProblem(
      new HttpException({ code: 'RATE_LIMITED', message: 'rate limit exceeded' }, 429),
      REQUEST_ID,
    );
    expect(p.code).toBe('RATE_LIMITED');
    expect(p.status).toBe(429);
  });

  it('unknown throwables become INTERNAL 500 and NEVER leak internals', () => {
    const p = toProblem(new Error('pg connection S3CR3T-password leaked 10.0.0.4:5432'), REQUEST_ID);
    expect(p.code).toBe('INTERNAL');
    expect(p.status).toBe(500);
    const serialized = JSON.stringify(p);
    expect(serialized).not.toContain('S3CR3T');
    expect(serialized).not.toContain('10.0.0.4');
    expect(serialized).not.toContain('pg connection');
  });

  it('non-Error throwables (strings, odd objects) are safe too', () => {
    const p = toProblem('string-throw', REQUEST_ID);
    expect(p.code).toBe('INTERNAL');
    expect(JSON.stringify(p)).not.toContain('string-throw');
  });
});

describe('apiErrors helpers', () => {
  it('carry fixed codes and correct statuses', () => {
    expect(apiErrors.notFound('project').code).toBe('NOT_FOUND');
    expect(apiErrors.tenantViolation().status).toBe(404);
    expect(apiErrors.rateLimited(30).meta).toEqual({ retryAfterSec: 30 });
    expect(apiErrors.creditInsufficient(500, 20).status).toBe(402);
    expect(apiErrors.flagLocked('sso').code).toBe('FLAG_LOCKED');
  });
});
