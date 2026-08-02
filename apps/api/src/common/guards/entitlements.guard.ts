/**
 * EntitlementsGuard — guard 4/5 (ADR-025 chain). Plan/subscription gating:
 * routes declare `@RequiresFeature('sso')` (boolean keys of PlanFeaturesSchema).
 *
 * Fail-CLOSED everywhere: no subscription row, non-active status, or
 * unparseable stored features → FLAG_LOCKED. TRIALING counts as active.
 */
import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  hasFeature,
  parsePlanFeatures,
  type BooleanFeature,
  type PlanFeatures,
} from '@aca/shared';
import type { DbClient } from '@aca/database';
import { apiErrors } from '../errors/api-error.js';
import { requestContext } from '../context/request-context.js';
import { PRISMA } from '../prisma.provider.js';

export const REQUIRED_FEATURE_KEY = 'aca:required-feature';
export const RequiresFeature = (feature: BooleanFeature) => SetMetadata(REQUIRED_FEATURE_KEY, feature);

export interface EntitlementSubject {
  subscriptionStatus: string | null; // null = no subscription row
  planFeatures: PlanFeatures | null; // null = unparseable (fail closed)
}

const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['ACTIVE', 'TRIALING']);

/** Pure entitlement decision (unit-tested directly). */
export function decideEntitlement(subject: EntitlementSubject, feature: BooleanFeature): void {
  if (subject.subscriptionStatus === null || !ACTIVE_STATUSES.has(subject.subscriptionStatus)) {
    throw apiErrors.flagLockedWithStatus(feature, subject.subscriptionStatus ?? 'NONE');
  }
  if (subject.planFeatures === null || !hasFeature(subject.planFeatures, feature)) {
    throw apiErrors.flagLocked(feature);
  }
}

@Injectable()
export class EntitlementsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PRISMA) private readonly prisma: DbClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<BooleanFeature>(REQUIRED_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (feature === undefined) return true;

    const ctx = requestContext();
    if (ctx.organizationId === null) {
      throw apiErrors.forbidden('feature check requires a tenant-scoped route');
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { orgId: ctx.organizationId },
      include: { plan: { select: { features: true } } },
    });

    decideEntitlement(
      {
        subscriptionStatus: subscription?.status ?? null,
        planFeatures: subscription === null ? null : parsePlanFeatures(subscription.plan.features),
      },
      feature,
    );
    return true;
  }
}
