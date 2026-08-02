/**
 * Route-inventory contract suite — STRUCTURAL enforcement of the API surface
 * rules (the suite referenced by common/validation/zod-validation.pipe.ts and
 * API.md §1 conventions). It walks the REAL Nest routing metadata of every
 * Module-1 controller (no source parsing) and fails when a route:
 *
 *   1. lacks a composed ZodValidationPipe (@UseZod) — validation declared ==
 *      validation enforced;
 *   2. declares @Body()/@Query()/@Param() extraction without the matching
 *      body/query/params schema in the pipe (and vice versa — orphan schemas
 *      are drift);
 *   3. is a mutation (POST/PUT/PATCH/DELETE) without @Idempotent()
 *      (Idempotency-Key contract, API.md §1);
 *   4. carries :orgId in its effective path without @TenantRequired()
 *      (tenant-isolation gate, handler- or class-level);
 *   5. is an org-scoped MUTATION without explicit @RequiresCapabilities
 *      (RBAC must be a decision, not an omission);
 *   6. is @Public outside the exact allowlist (BrandingResolveController only)
 *      or @Public without an explicit @RateLimit bucket;
 *   7. is served by a controller not pinned to URI version '1'.
 *
 * The full route surface is asserted EXACTLY (method + /v1 path template).
 * New routes land here deliberately — API.md additive-only policy means this
 * list only grows, and growth must come with the doc change FIRST.
 */
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  PIPES_METADATA,
  ROUTE_ARGS_METADATA,
  VERSION_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { IS_PUBLIC_KEY } from '../src/common/auth/auth.guard.js';
import { TENANT_REQUIRED_KEY } from '../src/common/auth/tenant.guard.js';
import { REQUIRED_CAPABILITIES_KEY } from '../src/common/guards/rbac.guard.js';
import { IDEMPOTENT_KEY } from '../src/common/idempotency/idempotency.interceptor.js';
import { RATE_LIMIT_KEY } from '../src/common/rate-limit/rate-limit.guard.js';
import { ZodValidationPipe, type ZodSchemas } from '../src/common/validation/zod-validation.pipe.js';
import { OrganizationsController } from '../src/modules/organizations/organizations.controller.js';
import { TeamsController } from '../src/modules/organizations/teams.controller.js';
import { DepartmentsController } from '../src/modules/organizations/departments.controller.js';
import { BrandingController, BrandingResolveController } from '../src/modules/organizations/branding.controller.js';
import { DomainsController } from '../src/modules/organizations/domains.controller.js';
import { OrgBillingController } from '../src/modules/organizations/billing.controller.js';

type ControllerClass = { readonly prototype: object; readonly name: string };

const MODULE_1_CONTROLLERS: readonly ControllerClass[] = [
  OrganizationsController,
  TeamsController,
  DepartmentsController,
  BrandingController,
  BrandingResolveController,
  DomainsController,
  OrgBillingController,
];

/** The ONLY routes allowed to skip AuthGuard in Module 1. */
const PUBLIC_ALLOWLIST: ReadonlySet<string> = new Set(['BrandingResolveController.resolve']);

const MUTATION_METHODS: ReadonlySet<RequestMethod> = new Set([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
]);

const METHOD_NAME: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
};

interface RouteEntry {
  controller: string;
  handler: string;
  method: RequestMethod;
  fullPath: string; // e.g. /v1/organizations/:orgId/teams/:teamId
  isPublic: boolean;
  tenantRequired: boolean;
  idempotent: boolean;
  capabilities: readonly string[];
  rateLimitBucket: unknown;
  zodPipes: ZodValidationPipe[];
  routeArgs: Record<string, unknown>;
}

/** getAllAndOverride parity: handler-level metadata wins, class is fallback. */
function meta<T>(key: string, handlerFn: object, klass: object): T | undefined {
  const onHandler = Reflect.getMetadata(key, handlerFn) as T | undefined;
  if (onHandler !== undefined) return onHandler;
  return Reflect.getMetadata(key, klass) as T | undefined;
}

function asPathList(value: unknown): readonly string[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function joinPaths(...segments: readonly string[]): string {
  const parts = segments
    .flatMap((s) => s.split('/'))
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return `/${parts.join('/')}`.replace(/\/+$/, '') || '/';
}

function inventory(controllers: readonly ControllerClass[]): RouteEntry[] {
  const routes: RouteEntry[] = [];
  for (const klass of controllers) {
    const proto: Record<string, unknown> = klass.prototype as Record<string, unknown>;
    const basePaths = asPathList(Reflect.getMetadata(PATH_METADATA, klass));
    for (const property of Object.getOwnPropertyNames(proto)) {
      if (property === 'constructor') continue;
      const handlerFn = proto[property];
      if (typeof handlerFn !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handlerFn) as RequestMethod | undefined;
      if (method === undefined) continue; // not a route handler
      const methodPaths = asPathList(Reflect.getMetadata(PATH_METADATA, handlerFn));
      const fullPath = joinPaths('v1', basePaths[0] ?? '', methodPaths[0] ?? '');

      const handlerPipes = (Reflect.getMetadata(PIPES_METADATA, handlerFn) as unknown[] | undefined) ?? [];
      const classPipes = (Reflect.getMetadata(PIPES_METADATA, klass) as unknown[] | undefined) ?? [];
      const zodPipes = [...classPipes, ...handlerPipes].filter(
        (p): p is ZodValidationPipe => p instanceof ZodValidationPipe,
      );

      routes.push({
        controller: klass.name,
        handler: property,
        method,
        fullPath,
        isPublic: meta<boolean>(IS_PUBLIC_KEY, handlerFn, klass) === true,
        tenantRequired: meta<boolean>(TENANT_REQUIRED_KEY, handlerFn, klass) === true,
        idempotent: meta<object>(IDEMPOTENT_KEY, handlerFn, klass) !== undefined,
        capabilities: meta<readonly string[]>(REQUIRED_CAPABILITIES_KEY, handlerFn, klass) ?? [],
        rateLimitBucket: meta<unknown>(RATE_LIMIT_KEY, handlerFn, klass),
        zodPipes,
        // Parameter decorators store under (class, methodName), keyed '<paramtype>:<index>'.
        routeArgs: (Reflect.getMetadata(ROUTE_ARGS_METADATA, klass, property) as Record<string, unknown> | undefined) ?? {},
      });
    }
  }
  return routes;
}

function paramUsage(route: RouteEntry, paramtype: RouteParamtypes): boolean {
  return Object.keys(route.routeArgs).some((key) => Number(key.split(':')[0]) === paramtype);
}

function schemasOf(pipe: ZodValidationPipe): ZodSchemas {
  // compile-time private; structurally present at runtime by construction.
  return (pipe as unknown as { schemas: ZodSchemas }).schemas;
}

const routes = inventory(MODULE_1_CONTROLLERS);
const routeId = (r: RouteEntry): string => `${r.controller}.${r.handler} (${METHOD_NAME[r.method] ?? '?'} ${r.fullPath})`;

describe('route-inventory contract (Module 1: organizations)', () => {
  it('walks the COMPLETE API.md surface — exact method + path templates, nothing more, nothing less', () => {
    const surface = routes.map((r) => `${METHOD_NAME[r.method] ?? '?'} ${r.fullPath}`).sort();
    expect(surface).toEqual(
      [
        'DELETE /v1/organizations/:orgId/departments/:departmentId',
        'DELETE /v1/organizations/:orgId/domains/:domainId',
        'DELETE /v1/organizations/:orgId/teams/:teamId',
        'DELETE /v1/organizations/:orgId/teams/:teamId/members/:userId',
        'GET /v1/branding/resolve',
        'GET /v1/organizations/:orgId',
        'GET /v1/organizations/:orgId/billing-profile',
        'GET /v1/organizations/:orgId/brand',
        'GET /v1/organizations/:orgId/departments',
        'GET /v1/organizations/:orgId/departments/:departmentId',
        'GET /v1/organizations/:orgId/domains',
        'GET /v1/organizations/:orgId/settings',
        'GET /v1/organizations/:orgId/subscription',
        'GET /v1/organizations/:orgId/teams',
        'GET /v1/organizations/:orgId/teams/:teamId',
        'PATCH /v1/organizations/:orgId',
        'PATCH /v1/organizations/:orgId/departments/:departmentId',
        'PATCH /v1/organizations/:orgId/settings',
        'PATCH /v1/organizations/:orgId/settings/security-policy',
        'PATCH /v1/organizations/:orgId/teams/:teamId',
        'POST /v1/organizations',
        'POST /v1/organizations/:orgId/brand/reset',
        'POST /v1/organizations/:orgId/departments',
        'POST /v1/organizations/:orgId/domains',
        'POST /v1/organizations/:orgId/domains/:domainId/verify',
        'POST /v1/organizations/:orgId/teams',
        'POST /v1/organizations/:orgId/teams/:teamId/members',
        'PUT /v1/organizations/:orgId/billing-profile',
        'PUT /v1/organizations/:orgId/brand',
      ].sort(),
    );
  });

  it('every controller is pinned to URI version 1 (additive-only versioning policy)', () => {
    for (const klass of MODULE_1_CONTROLLERS) {
      expect(Reflect.getMetadata(VERSION_METADATA, klass), `${klass.name} version`).toBe('1');
    }
  });

  it('every route handler composes a ZodValidationPipe (@UseZod) — validation declared == enforced', () => {
    for (const r of routes) {
      expect(r.zodPipes.length, `${routeId(r)} must use @UseZod`).toBeGreaterThanOrEqual(1);
    }
  });

  it('body/query/params extraction always has the matching schema — and no orphan schemas', () => {
    for (const r of routes) {
      const schemas = r.zodPipes.map(schemasOf);
      if (paramUsage(r, RouteParamtypes.BODY)) {
        expect(schemas.some((s) => s.body !== undefined), `${routeId(r)} @Body() without body schema`).toBe(true);
      }
      if (paramUsage(r, RouteParamtypes.QUERY)) {
        expect(schemas.some((s) => s.query !== undefined), `${routeId(r)} @Query() without query schema`).toBe(true);
      }
      if (paramUsage(r, RouteParamtypes.PARAM)) {
        expect(schemas.some((s) => s.params !== undefined), `${routeId(r)} @Param() without params schema`).toBe(true);
      }
      for (const s of schemas) {
        if (s.body !== undefined) {
          expect(paramUsage(r, RouteParamtypes.BODY), `${routeId(r)} declares body schema without @Body()`).toBe(true);
        }
        if (s.query !== undefined) {
          expect(paramUsage(r, RouteParamtypes.QUERY), `${routeId(r)} declares query schema without @Query()`).toBe(true);
        }
        if (s.params !== undefined) {
          expect(paramUsage(r, RouteParamtypes.PARAM), `${routeId(r)} declares params schema without @Param()`).toBe(true);
        }
      }
    }
  });

  it('every mutation endpoint is @Idempotent() (Idempotency-Key contract, API.md §1)', () => {
    for (const r of routes) {
      if (MUTATION_METHODS.has(r.method)) {
        expect(r.idempotent, `${routeId(r)} mutation without @Idempotent()`).toBe(true);
      }
    }
  });

  it('every :orgId route is @TenantRequired() (tenant guard engaged — isolation is structural)', () => {
    for (const r of routes) {
      if (r.fullPath.includes(':orgId')) {
        expect(r.tenantRequired, `${routeId(r)} carries :orgId without @TenantRequired()`).toBe(true);
      }
    }
  });

  it('every org-scoped MUTATION declares explicit @RequiresCapabilities (RBAC is a decision, not an omission)', () => {
    for (const r of routes) {
      if (r.fullPath.includes(':orgId') && MUTATION_METHODS.has(r.method)) {
        expect(r.capabilities.length, `${routeId(r)} org-scoped mutation without capability declaration`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('@Public is confined to the allowlist and always carries an explicit rate-limit bucket', () => {
    for (const r of routes) {
      if (r.isPublic) {
        expect(
          PUBLIC_ALLOWLIST.has(`${r.controller}.${r.handler}`),
          `${routeId(r)} is @Public but not in the allowlist`,
        ).toBe(true);
        expect(r.rateLimitBucket, `${routeId(r)} @Public without explicit @RateLimit bucket`).not.toBeUndefined();
      }
    }
  });
});
