/**
 * Platform endpoint contract — /health, /health/live, /health/ready, /metrics.
 *
 * These are OPS surfaces, not versioned product API: load balancers, k8s
 * probes and Prometheus scrape configs pin the PLAIN paths. Two regression
 * classes are locked here because both shipped silently once:
 *   1. URI versioning + defaultVersion:'1' moved them to /v1/* (plain paths
 *      answered 404) — controllers must be VERSION_NEUTRAL.
 *   2. SwaggerModule.setup under Fastify hard-exits (loadPackage →
 *      process.exit(1)) at boot when @fastify/static is not a declared
 *      dependency — no test booted main.ts, so nothing caught it.
 */
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VERSION_NEUTRAL } from '@nestjs/common';
import { PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { HealthController } from '../src/health/health.controller.js';
import { MetricsController } from '../src/metrics/metrics.controller.js';
import { IS_PUBLIC_KEY } from '../src/common/auth/auth.guard.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('platform routes (ops surfaces)', () => {
  const reflector = new Reflector();

  it('health + metrics controllers are VERSION_NEUTRAL (plain /health, /metrics — never /v1/*)', () => {
    for (const [controller, path] of [
      [HealthController, 'health'],
      [MetricsController, 'metrics'],
    ] as const) {
      expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(path);
      expect(Reflect.getMetadata(VERSION_METADATA, controller)).toBe(VERSION_NEUTRAL);
    }
  });

  it('every platform handler opts out of auth explicitly (@Public)', () => {
    for (const controller of [HealthController, MetricsController]) {
      for (const key of Object.getOwnPropertyNames(controller.prototype)) {
        if (key === 'constructor') continue;
        const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, (controller.prototype as Record<string, unknown>)[key]);
        expect(isPublic, `${controller.name}.${key} must be @Public`).toBe(true);
      }
    }
  });

  it('@fastify/static is a declared dependency at the patched line (Swagger UI serving would exit(1) at boot without it; ≤10.1.0 is GHSA route-guard-bypass)', () => {
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const range = pkg.dependencies['@fastify/static'] ?? '';
    expect(range).toMatch(/^\^?\d+\./);
    const major = Number.parseInt(range.replace(/^\^/, ''), 10);
    expect(major, 'route-guard-bypass fix requires >=10.1.1').toBeGreaterThanOrEqual(10);
  });
});
