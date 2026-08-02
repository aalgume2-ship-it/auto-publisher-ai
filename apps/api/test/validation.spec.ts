import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../src/common/errors/api-error.js';
import {
  ZodValidationPipe,
  compactIssues,
  validateWith,
} from '../src/common/validation/zod-validation.pipe.js';

const CreateProjectBody = z.object({
  name: z.string().min(1).max(120),
  niche: z.enum(['gaming', 'finance', 'education']),
  dailyUploads: z.number().int().min(0).max(10).default(1),
});

describe('validateWith (pure)', () => {
  it('returns parsed output with defaults applied and unknown keys STRIPPED', () => {
    const out = validateWith(CreateProjectBody, { name: 'TT', niche: 'gaming', hackerField: true });
    expect(out).toEqual({ name: 'TT', niche: 'gaming', dailyUploads: 1 });
    expect('hackerField' in (out as object)).toBe(false);
  });

  it('throws ApiError VALIDATION_FAILED with compact issues', () => {
    try {
      validateWith(CreateProjectBody, { name: '', dailyUploads: 99 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError<{ issues: unknown }>;
      expect(apiErr.code).toBe('VALIDATION_FAILED');
      expect(apiErr.status).toBe(400);
      expect(apiErr.meta?.issues).toEqual([
        { path: 'name', code: 'too_small', message: expect.any(String) },
        { path: 'niche', code: 'invalid_type', message: expect.any(String) },
        { path: 'dailyUploads', code: 'too_big', message: expect.any(String) },
      ]);
    }
  });

  it('compactIssues renders nested paths', () => {
    const Nested = z.object({ org: z.object({ slug: z.string().min(3) }) });
    try {
      validateWith(Nested, { org: { slug: 'x' } });
      expect.unreachable();
    } catch (err) {
      const issues = (err as ApiError<{ issues: { path: string }[] }>).meta?.issues ?? [];
      expect(issues[0]?.path).toBe('org.slug');
    }
  });
});

describe('ZodValidationPipe (method-scoped)', () => {
  const pipe = new ZodValidationPipe({ body: CreateProjectBody, params: z.object({ orgId: z.string().uuid() }) });

  it('validates body when a body schema is declared', () => {
    const out = pipe.transform(
      { name: 'X', niche: 'finance' },
      { type: 'body' },
    );
    expect(out).toEqual({ name: 'X', niche: 'finance', dailyUploads: 1 });
  });

  it('validates params when a params schema is declared', () => {
    const uuid = '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55';
    expect(pipe.transform({ orgId: uuid }, { type: 'param' })).toEqual({ orgId: uuid });
    expect(() => pipe.transform({ orgId: 'nope' }, { type: 'param' })).toThrowError(ApiError);
  });

  it('passes through parts with no declared schema (e.g. query undeclared)', () => {
    const raw = { cursor: 'abc' };
    expect(pipe.transform(raw, { type: 'query' })).toBe(raw);
  });

  it('passes through custom decorators untouched', () => {
    const raw = { anything: true };
    expect(pipe.transform(raw, { type: 'custom', data: 'x' })).toBe(raw);
  });

  it('body failures carry issue triples (path/code/message)', () => {
    try {
      pipe.transform({ niche: 'wrong' }, { type: 'body' });
      expect.unreachable();
    } catch (err) {
      const apiErr = err as ApiError<{ issues: { path: string; code: string; message: string }[] }>;
      expect(apiErr.meta?.issues.every((i) => typeof i.path === 'string' && typeof i.code === 'string' && typeof i.message === 'string')).toBe(true);
    }
  });
});

describe('ZodValidationPipe — named extraction (@Param("key")/@Query("key") scalars)', () => {
  // The case the whole-object tests encoded WRONG for the module's lifetime:
  // Nest hands named decorators the scalar only (metadata.data = key). Every
  // :orgId route failed with 400 "Expected object, received string" before
  // the scalar-aware path existed (caught live by the HTTP integration suite).
  const params = z.object({ orgId: z.string().uuid(), teamId: z.string().uuid() });
  const query = z.object({ host: z.string().min(1), limit: z.coerce.number().int().min(1).max(100) });
  const pipe = new ZodValidationPipe({ params, query });

  const ORG = '0190844f-9f2e-7c3a-9b1d-2f8f6a1c4e55';
  const TEAM = '0190844f-9f30-7b34-b772-2f8f6a1c4e66';

  it('validates a named param scalar against the shape (orgId + teamId independently)', () => {
    expect(pipe.transform(ORG, { type: 'param', data: 'orgId' })).toBe(ORG);
    expect(pipe.transform(TEAM, { type: 'param', data: 'teamId' })).toBe(TEAM);
  });

  it('rejects an invalid named scalar with the key as the issue path', () => {
    try {
      pipe.transform('not-a-uuid', { type: 'param', data: 'orgId' });
      expect.unreachable();
    } catch (err) {
      const apiErr = err as ApiError<{ issues: { path: string }[] }>;
      expect(apiErr.code).toBe('VALIDATION_FAILED');
      expect(apiErr.meta?.issues[0]?.path).toBe('orgId');
    }
  });

  it('fails closed on an unknown named key (contract drift must not slip silently)', () => {
    expect(() => pipe.transform('x', { type: 'param', data: 'ghost' })).toThrowError(ApiError);
  });

  it('validates named query scalars (including coercion)', () => {
    expect(pipe.transform('portal.example.com', { type: 'query', data: 'host' })).toBe('portal.example.com');
    expect(pipe.transform('50', { type: 'query', data: 'limit' })).toBe(50);
  });

  it('defensive: named extraction against a NON-object schema also fails closed', () => {
    const broken = new ZodValidationPipe({ params: z.string() });
    expect(() => broken.transform('x', { type: 'param', data: 'orgId' })).toThrowError(ApiError);
  });

  it('bare @Param() (whole container) still validates and strips', () => {
    expect(pipe.transform({ orgId: ORG, teamId: TEAM, extra: 1 }, { type: 'param' })).toEqual({ orgId: ORG, teamId: TEAM });
  });
});

describe('compactIssues', () => {
  it('produces deterministic triples', () => {
    const S = z.object({ a: z.string() });
    const res = S.safeParse({ a: 1 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(compactIssues(res.error.issues)).toEqual([
        { path: 'a', code: 'invalid_type', message: expect.any(String) },
      ]);
    }
  });
});
