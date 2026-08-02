/**
 * PlanFeaturesSchema — the zod shape of `plans.features` (Database.md §3;
 * docs/API.md §4.3/§5/§9 reference feature gating by name).
 *
 * This schema is the entitlement dictionary: EntitlementsGuard evaluates the
 * BOOLEAN keys (`@RequiresFeature('sso')`); quota-ish keys (auditRetentionDays,
 * trialDays, supportTier…) are read by services, never by the guard.
 *
 * STRICT: an unknown key in stored plan features fails parsing CLOSED
 * (feature hidden) — a typo must never silently grant access. Seed data
 * (packages/database/prisma/seeds/plans.json) is the conformance fixture.
 */
import { z } from 'zod';

export const PLAN_REVIEW_MODES = ['FULL_AUTO', 'REVIEW_SCRIPT', 'REVIEW_MEDIA', 'REVIEW_FINAL'] as const;
export type PlanReviewMode = (typeof PLAN_REVIEW_MODES)[number];

export const PlanFeaturesSchema = z
  .object({
    trialDays: z.number().int().min(0),
    watermark: z.boolean(),
    autopilot: z.boolean(),
    reviewModes: z.array(z.enum(PLAN_REVIEW_MODES)).min(1),
    platforms: z.array(z.string().min(1)).min(1), // platform registry ids (@see platform.ts)
    priorityPlatformRoadmap: z.boolean().optional(),
    apiAccess: z.boolean(),
    apiRateClass: z.enum(['standard', 'elevated', 'dedicated']).optional(),
    byok: z.boolean(),
    thumbnailAb: z.boolean(),
    optimizerAutoApply: z.boolean(),
    priorityQueue: z.boolean(),
    regionPinning: z.boolean(),
    whiteLabel: z.boolean(),
    sso: z.boolean(),
    scim: z.boolean().optional(),
    customRoles: z.boolean().optional(),
    extraSeatPriceCents: z.number().int().min(0).optional(),
    auditRetentionDays: z.number().int().min(1),
    auditExportApi: z.boolean(),
    supportTier: z.string().min(1),
    slaBps: z.number().int().min(0).max(10_000).optional(),
    customPricing: z.boolean().optional(),
  })
  .strict();

export type PlanFeatures = z.infer<typeof PlanFeaturesSchema>;

/** Boolean keys usable with @RequiresFeature / entitlement checks. */
export const BOOLEAN_FEATURES = [
  'watermark',
  'autopilot',
  'priorityPlatformRoadmap',
  'apiAccess',
  'byok',
  'thumbnailAb',
  'optimizerAutoApply',
  'priorityQueue',
  'regionPinning',
  'whiteLabel',
  'sso',
  'scim',
  'customRoles',
  'auditExportApi',
  'customPricing',
] as const satisfies readonly (keyof PlanFeatures)[];

export type BooleanFeature = (typeof BOOLEAN_FEATURES)[number];

/** Parses stored plan.features fail-closed: invalid shape → every feature treated as absent. */
export function parsePlanFeatures(raw: unknown): PlanFeatures | null {
  const parsed = PlanFeaturesSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Boolean entitlement evaluation over already-parsed features (absent optional keys = false). */
export function hasFeature(features: PlanFeatures, key: BooleanFeature): boolean {
  return features[key] === true;
}
