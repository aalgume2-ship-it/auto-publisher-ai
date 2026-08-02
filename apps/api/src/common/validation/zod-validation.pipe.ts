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
 *
 * NAMED EXTRACTION SEMANTICS (Nest): @Param('orgId') / @Query('host') deliver
 * only the SCALAR of that key to the pipe (metadata.data = the key), while
 * bare @Param()/@Query() deliver the whole container. The pipe therefore
 * validates named values against the container object schema's SHAPE for that
 * key; unknown named keys fail closed. Container-level mass-assignment
 * stripping still applies on bare extraction only — named scalars are
 * validated, not merged back, which matches Nest's argument plumbing.
 *
 * Write endpoints without @UseZod fail the route-inventory contract suite
 * (test/routes-inventory.spec.ts) — structural, not by convention.
 */
import { UsePipes, applyDecorators, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { z, type ZodIssue, type ZodTypeAny } from 'zod';
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

/** Pure named-extraction validation (unit-tested directly; wrapped by the pipe below). */
export function validateNamed(container: ZodTypeAny, key: string, value: unknown): unknown {
  if (!(container instanceof z.ZodObject)) {
    // route-inventory contract suite makes this unreachable: declared params/query
    // schemas on named extraction are always z.object(...)
    throw apiErrors.validationFailed([
      { path: key, code: 'invalid_type', message: `${key} is not a recognized parameter` },
    ]);
  }
  const field: ZodTypeAny | undefined = container.shape[key];
  if (field === undefined) {
    throw apiErrors.validationFailed([
      { path: key, code: 'invalid_type', message: `${key} is not a recognized parameter` },
    ]);
  }
  const parsed = field.safeParse(value);
  if (!parsed.success) {
    // scalar parse paths are root-relative; the contract must name the FAILING
    // KEY so 400 bodies point at the parameter, not the void
    throw apiErrors.validationFailed(
      compactIssues(parsed.error.issues).map((issue) => ({
        ...issue,
        path: issue.path === '' ? key : `${key}.${issue.path}`,
      })),
    );
  }
  return parsed.data;
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
    // NAMED extraction (@Param('orgId') / @Query('host')) hands the pipe the
    // SCALAR for that key, never the container — validating the scalar against
    // the container object schema fails every org-scoped route with
    // "invalid_type: Expected object, received string" (caught by the HTTP
    // integration suite, every :orgId route answered 400). Validate the key
    // against the container schema's shape instead.
    if ((metadata.type === 'param' || metadata.type === 'query') && typeof metadata.data === 'string') {
      return validateNamed(schema, metadata.data, value);
    }
    return validateWith(schema, value);
  }
}
