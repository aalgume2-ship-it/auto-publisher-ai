/**
 * OpenAPI ProblemDetails contract — regression for the Swagger UI resolver
 * errors: "Could not resolve pointer: /components/schemas/ProblemDetails
 * does not exist in document".
 *
 * Root cause: 6 controllers inlined `const PROBLEM = { $ref: '#/components/
 * schemas/ProblemDetails' }` and nothing registered that component — the ref
 * and the registration drifted apart and nothing caught it (docs served 200;
 * only the UI's resolver complained).
 *
 * Locked here:
 *   1. registerProblemDetailsComponent registers a schema whose shape matches
 *      the @aca/shared ProblemDetails wire contract (required fields + code
 *      enum sourced from the SAME ErrorCodes constant the runtime uses).
 *   2. Every hardcoded '#/components/schemas/*' $ref in src is one this repo
 *      actually registers — a whole-repo scan, so the NEXT component added
 *      without registration fails here instead of on the deployed docs page.
 *   3. No controller re-introduces a local PROBLEM const (drift guard).
 */
import 'reflect-metadata';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OpenAPIObject } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { ErrorCodes } from '@aca/shared';
import {
  PROBLEM,
  PROBLEM_DETAILS_SCHEMA_NAME,
  problemDetailsSchema,
  registerProblemDetailsComponent,
  REGISTERED_COMPONENT_SCHEMAS,
} from '../src/common/http/problem-details.openapi.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src');

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (entry.endsWith('.ts')) yield full;
  }
}

describe('OpenAPI ProblemDetails component', () => {
  it('registers the component the controllers reference (same name, same source)', () => {
    expect(PROBLEM.$ref).toBe(`#/components/schemas/${PROBLEM_DETAILS_SCHEMA_NAME}`);

    const document = { openapi: '3.0.0', info: {}, paths: {} } as unknown as OpenAPIObject;
    registerProblemDetailsComponent(document);
    const schemas = (document.components as { schemas: Record<string, Record<string, unknown>> }).schemas;
    expect(schemas[PROBLEM_DETAILS_SCHEMA_NAME]).toBeDefined();

    // pointer resolution exactly as a JSON-Ref resolver would do it
    const pointer = PROBLEM.$ref.replace(/^#\//, '').split('/');
    let node: unknown = document as unknown;
    for (const segment of pointer) node = (node as Record<string, unknown>)[segment];
    expect(node).toBeDefined();
  });

  it('schema matches the @aca/shared ProblemDetails<M> wire contract', () => {
    const schema = problemDetailsSchema() as {
      type: string;
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    };
    expect(schema.type).toBe('object');
    // interface fields: type, title, status, code (required) + detail?, requestId (required), meta?
    expect(schema.required).toEqual(expect.arrayContaining(['type', 'title', 'status', 'code', 'requestId']));
    for (const field of ['type', 'title', 'status', 'code', 'detail', 'requestId', 'meta']) {
      expect(schema.properties[field], `missing property ${field}`).toBeDefined();
    }
    // code enum must be sourced from the runtime's ErrorCodes, not a hand-copied list
    expect(schema.properties.code.enum).toEqual([...ErrorCodes]);
    expect((schema.properties.code.enum as string[]).length).toBeGreaterThan(0);
  });

  it('registration is idempotent and never clobbers an existing component', () => {
    const sentinel = { type: 'object', description: 'do-not-overwrite' };
    const document = {
      openapi: '3.0.0', info: {}, paths: {},
      components: { schemas: { [PROBLEM_DETAILS_SCHEMA_NAME]: sentinel } },
    } as unknown as OpenAPIObject;
    registerProblemDetailsComponent(document);
    expect((document.components as { schemas: Record<string, unknown> }).schemas[PROBLEM_DETAILS_SCHEMA_NAME]).toBe(sentinel);
  });

  it('every hardcoded #/components/schemas/* $ref in src resolves to a registered schema', () => {
    const registered = REGISTERED_COMPONENT_SCHEMAS; // single allow-list, lives with the registrars
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/#\/components\/schemas\/([A-Za-z0-9_-]+)/g)) {
        // the shared const derives its ref from the NAME constant — that is the reference, not a violation
        if (file.endsWith('problem-details.openapi.ts')) continue;
        if (!registered.has(match[1])) offenders.push(`${relative(SRC, file)} -> ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no controller re-inlines a local PROBLEM const (drift guard)', () => {
    for (const file of walk(join(SRC, 'modules'))) {
      const text = readFileSync(file, 'utf8');
      expect(text.includes("const PROBLEM ="), `${file} re-inlined PROBLEM`).toBe(false);
    }
  });
});
