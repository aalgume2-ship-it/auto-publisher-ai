/**
 * ProblemDetails OpenAPI component — THE single registration point for the
 * RFC 9457 error schema referenced by every controller's error responses.
 *
 * Why this module exists (root cause of the Swagger UI "Could not resolve
 * pointer /components/schemas/ProblemDetails" resolver errors): controllers
 * inlined `const PROBLEM = { $ref: '#/components/schemas/ProblemDetails' }`
 * while NOTHING registered that component in the generated document — the
 * reference and the registration were allowed to drift apart silently.
 *
 * The drift is now compile-impossible: controllers import `PROBLEM` (whose
 * name is derived from PROBLEM_DETAILS_SCHEMA_NAME) and bootstrap imports
 * `registerProblemDetailsComponent` — both live here, side by side.
 *
 * Schema mirrors @aca/shared ProblemDetails<M> (packages/shared/src/errors.ts)
 * field-for-field; keep in sync if the wire contract ever changes (contract
 * test openapi-problem-details.spec.ts pins the shape).
 */
import type { OpenAPIObject } from '@nestjs/swagger';
import { ErrorCodes } from '@aca/shared';

export const PROBLEM_DETAILS_SCHEMA_NAME = 'ProblemDetails' as const;

/** Use in @Api*Response decorators: content: { 'application/problem+json': { schema: PROBLEM } } */
export const PROBLEM = { $ref: `#/components/schemas/${PROBLEM_DETAILS_SCHEMA_NAME}` } as const;

/**
 * RFC 9457 problem+json schema — required: type, title, status, code, requestId.
 * `code` is constrained to the platform ErrorCode enum (from @aca/shared, the
 * same constant the runtime filter selects from), with a realistic example.
 */
export function problemDetailsSchema(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['type', 'title', 'status', 'code', 'requestId'],
    properties: {
      type: {
        type: 'string',
        format: 'uri',
        description: 'Stable URI identifying the error class.',
        example: 'https://docs.autocreator.ai/errors/not-found',
      },
      title: { type: 'string', example: 'Organization not found' },
      status: { type: 'integer', minimum: 400, maximum: 599, example: 404 },
      code: {
        type: 'string',
        enum: [...ErrorCodes],
        description: 'Machine-parseable platform code — always present.',
        example: 'NOT_FOUND',
      },
      detail: { type: 'string', description: 'Human-readable explanation specific to this occurrence.' },
      requestId: {
        type: 'string',
        description: 'Echoed X-Request-Id for support correlation.',
        example: '019fc720-8fea-7cd3-a1b2-390aaf0d2f71',
      },
      meta: { type: 'object', additionalProperties: true, description: 'Optional structured context.' },
    },
  };
}

/** Registers the ProblemDetails component schema into a generated OpenAPI document (idempotent). */
export function registerProblemDetailsComponent(document: OpenAPIObject): void {
  document.components ??= {};
  const components = document.components as { schemas?: Record<string, unknown> };
  components.schemas ??= {};
  components.schemas[PROBLEM_DETAILS_SCHEMA_NAME] ??= problemDetailsSchema();
}

/* ---------------------------------------------------------------------- */
/* AuthUser — shared component referenced by /v1/auth responses            */
/* ---------------------------------------------------------------------- */

export const AUTH_USER_SCHEMA_NAME = 'AuthUser' as const;

/** Mirrors @aca/auth PublicUser (packages/auth/src/service.ts) — co-evolve on contract change. */
export function authUserSchema(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['id', 'email', 'displayName', 'locale', 'timezone', 'emailVerifiedAt', 'mfaEnabled'],
    properties: {
      id: { type: 'string', format: 'uuid', example: '019fc72a-1111-7cd3-a1b2-390aaf0d2f71' },
      email: { type: 'string', format: 'email', example: 'sara@noormedia.sa' },
      displayName: { type: 'string', example: 'Sara Alotaibi' },
      locale: { type: 'string', example: 'ar-SA' },
      timezone: { type: 'string', example: 'Asia/Riyadh' },
      emailVerifiedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
      mfaEnabled: { type: 'boolean', example: false },
    },
  };
}

/** Registers the AuthUser component schema (idempotent). */
export function registerAuthUserComponent(document: OpenAPIObject): void {
  document.components ??= {};
  const components = document.components as { schemas?: Record<string, unknown> };
  components.schemas ??= {};
  components.schemas[AUTH_USER_SCHEMA_NAME] ??= authUserSchema();
}

/** Every shared component configured above — the allow-list for the repo-wide $ref contract test. */
export const REGISTERED_COMPONENT_SCHEMAS: ReadonlySet<string> = new Set([PROBLEM_DETAILS_SCHEMA_NAME, AUTH_USER_SCHEMA_NAME]);
