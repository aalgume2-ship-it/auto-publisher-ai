import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOOLEAN_FEATURES,
  PlanFeaturesSchema,
  hasFeature,
  parsePlanFeatures,
} from '../src/plan-features.js';

const SEEDS_PATH = join(__dirname, '../../database/prisma/seeds/plans.json');

describe('PlanFeaturesSchema', () => {
  it('parses EVERY seeded plan (seed data is the conformance fixture)', () => {
    const doc = JSON.parse(readFileSync(SEEDS_PATH, 'utf8')) as { plans: Array<{ code: string; features: unknown }> };
    const seed = doc.plans;
    expect(seed.length).toBeGreaterThanOrEqual(5);
    for (const plan of seed) {
      const parsed = PlanFeaturesSchema.safeParse(plan.features);
      expect(parsed.success, `plan "${plan.code}" features must conform`).toBe(true);
    }
  });

  it('is STRICT — unknown keys are rejected (fail-closed)', () => {
    const parsed = PlanFeaturesSchema.safeParse({ trialDays: 0, typoKey: true });
    expect(parsed.success).toBe(false);
  });

  it('parsePlanFeatures returns null on invalid shape instead of throwing', () => {
    expect(parsePlanFeatures({ nope: 1 })).toBeNull();
    expect(parsePlanFeatures('junk')).toBeNull();
  });

  it('hasFeature treats absent optional keys as false', () => {
    const features = parsePlanFeatures({
      trialDays: 0, watermark: false, autopilot: true,
      reviewModes: ['FULL_AUTO'], platforms: ['youtube'],
      apiAccess: false, byok: false, thumbnailAb: false, optimizerAutoApply: false,
      priorityQueue: false, regionPinning: false, whiteLabel: false, sso: false,
      auditRetentionDays: 30, auditExportApi: false, supportTier: 'community',
    });
    expect(features).not.toBeNull();
    if (features !== null) {
      expect(hasFeature(features, 'scim')).toBe(false); // optional & absent
      expect(hasFeature(features, 'autopilot')).toBe(true);
      expect(hasFeature(features, 'whiteLabel')).toBe(false);
    }
  });

  it('BOOLEAN_FEATURES only contains boolean-keyed entries of the schema', () => {
    // regression: a quota-ish key (number/string) must never become a guard predicate
    expect(BOOLEAN_FEATURES).not.toContain('auditRetentionDays');
    expect(BOOLEAN_FEATURES).not.toContain('supportTier');
    expect(BOOLEAN_FEATURES).not.toContain('trialDays');
  });
});
