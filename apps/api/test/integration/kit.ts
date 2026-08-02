/**
 * Integration kit — env, app boot (full AppModule, fastify inject), seed
 * helpers. Real PG + Redis only; DNS is the one substituted port (hermetic).
 */
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { VersioningType } from '@nestjs/common';
import { createPrismaClient, generateId, type DbClient } from '@aca/database';
import { AppModule } from '../../src/app.module.js';
import { DNS_VERIFIER, type DnsVerifier } from '../../src/modules/organizations/domains.service.js';
import { signSessionJwt, type SessionClaims } from '../../src/common/auth/session-jwt.js';

export const IT = process.env['ACA_API_IT'] === '1';

export const JWT_SECRET = process.env['AUTH_JWT_SECRET'] ?? 'integration-test-secret-0123456789abcdef0123456789abcdef';
process.env['AUTH_JWT_SECRET'] = JWT_SECRET;

export interface ItApp {
  app: NestFastifyApplication;
  db: DbClient;
  dns: DnsVerifier & { resolveTxtRecord: ReturnType<typeof vi.fn> };
  close(): Promise<void>;
}

export async function bootApp(db: DbClient): Promise<ItApp> {
  const dns = { resolveTxtRecord: vi.fn<(host: string) => Promise<string[]>>().mockResolvedValue([]) };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DNS_VERIFIER)
    .useValue(dns)
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return {
    app,
    db,
    dns,
    close: async () => {
      await app.close();
    },
  };
}

export function mintUserToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    sub: userId,
    sid: randomUUID(),
    typ: 'access',
    iss: 'https://api.autocreator.ai',
    aud: 'aca-first-party',
    iat: now,
    exp: now + 900,
  };
  return signSessionJwt(claims, JWT_SECRET);
}

export interface SeedUser {
  id: string;
  email: string;
}

export async function seedUser(db: DbClient, tag: string): Promise<SeedUser> {
  const id = generateId();
  const email = `it-${tag}-${id.slice(0, 12).toLowerCase()}@example.test`;
  await db.user.create({ data: { id, email, displayName: `IT ${tag}`, status: 'ACTIVE' } });
  return { id, email };
}

export const PLAN_FEATURES = {
  trialDays: 14,
  watermark: false,
  autopilot: true,
  reviewModes: ['FULL_AUTO', 'REVIEW_FINAL'],
  platforms: ['youtube', 'tiktok'],
  apiAccess: true,
  byok: true,
  thumbnailAb: true,
  optimizerAutoApply: true,
  priorityQueue: true,
  regionPinning: true,
  whiteLabel: true,
  sso: true,
  auditRetentionDays: 365,
  auditExportApi: true,
  supportTier: 'priority',
} as const;

/** Plan + ACTIVE subscription for org (whiteLabel entitled). */
export async function seedSubscription(db: DbClient, orgId: string): Promise<void> {
  const planId = generateId();
  await db.plan.create({
    data: {
      id: planId,
      code: `it-plan-${planId.slice(0, 8).toLowerCase()}`,
      name: 'IT Plan',
      monthlyPriceCents: 4900,
      yearlyPriceCents: 47000,
      aiCreditsMonthly: 5000,
      maxChannels: 10,
      maxProjects: 25,
      maxVideosPerMonth: 300,
      maxTeamMembers: 15,
      maxStorageGb: 500,
      features: PLAN_FEATURES,
      isPublic: false,
    },
  });
  await db.subscription.create({
    data: {
      id: generateId(),
      orgId,
      planId,
      provider: 'stripe',
      status: 'ACTIVE',
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    },
  });
}

export interface AuthedClient {
  orgId: string | null;
  headers(extra?: Record<string, string>): Record<string, string>;
}

export function authed(userId: string): AuthedClient & { userId: string } {
  const token = mintUserToken(userId);
  return {
    userId,
    orgId: null,
    headers(extra = {}) {
      return { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra };
    },
  };
}

export function problemOf(res: { statusCode: number; body: string }): { code?: string; status?: number } {
  try {
    return JSON.parse(res.body) as { code?: string; status?: number };
  } catch {
    return {};
  }
}
