/**
 * Zod validation — schemas are declared ONCE per route (docs/API.md bodies ARE
 * the zod schemas) and enforced by a method-scoped pipe composed into the same
 * decorator, so declaring the schema and enforcing it cannot drift apart:
 *
 *   @UseZod({ body: CreateProjectBody, params: OrgParams })
 *   create(@Body() body: z.infer<typeof CreateProjectBody>) { ... }
 *
 * The pipe REPLACES the raw value with the parsed output (zod strips unknown
 * keys by default — mass-assignment defense) or throws
 * ApiError(VALIDATION_FAILED) with meta.issues (path/code/message triples).
 * Write endpoints without @UseZod fail the route-inventory contract suite
 * (test/routes-inventory.spec.ts) — structural, not by convention.
 */
import { UsePipes, applyDecorators, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { z, ZodIssue, ZodTypeAny } from 'zod';
import { apiErrors } from '../errors/api-error.js';

export const ZOD_SCHEMAS_KEY = 'aca:zod-schemas';

export interface ZodSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export const UseZod = (schemas: ZodSchemas) =>
  applyDecorators(UsePipes(new ZodValidationPipe(schemas)));

export interface ZodIssueView {
  path: string;
  code: string;
  message: string;
}

export function compactIssues(issues: readonly ZodIssue[]): ZodIssueView[] {
  return issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message }));
}

/** Pure validation step (unit-tested directly). Returns parsed output or throws ApiError. */
export function validateWith<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw apiErrors.validationFailed(compactIssues(parsed.error.issues));
  }
  return parsed.data as z.infer<S>;
}

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schemas: ZodSchemas) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema =
      metadata.type === 'body'
        ? this.schemas.body
        : metadata.type === 'query'
          ? this.schemas.query
          : metadata.type === 'param'
            ? this.schemas.params
            : undefined;
    if (schema === undefined) return value; // no schema declared for this part — passthrough
    return validateWith(schema, value);
  }
}
