/**
 * BrandingService — white-label brand config (API.md §5). Rules:
 *  - GET returns platform defaults when no row exists (never 404 for own org).
 *  - hidePoweredBy=true is plan-gated by the `whiteLabel` boolean feature
 *    (fail-closed: unparseable/absent plan features hide the feature).
 *  - Logo/favicon asset ids must belong to the org (tenant-scoped check).
 *  - /branding/resolve is PUBLIC (portal runtime): only ACTIVE PORTAL domains
 *    resolve, and it returns only brand-safe fields.
 */
import { Inject, Injectable } from '@nestjs/common';
import { generateId, type DbClient, type Prisma } from '@aca/database';
import type { OutboxWriter } from '@aca/events';
import { hasFeature, parsePlanFeatures } from '@aca/shared';
import { apiErrors } from '../../common/errors/api-error.js';
import { PRISMA, TENANT_CLIENT, type TenantClientFactory } from '../../common/prisma.provider.js';
import { OUTBOX_WRITER } from '../../common/events/outbox.provider.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { DomainOperations } from '../../common/telemetry/domain-operations.js';
import type { PutBrandBody } from './branding.dto.js';

const MODULE = 'organizations';

export interface BrandDto {
  brandName: string | null;
  logoAssetId: string | null;
  logoDarkAssetId: string | null;
  faviconAssetId: string | null;
  primaryColor: string;
  theme: Record<string, string>;
  emailFromName: string | null;
  emailTemplatePack: string;
  supportUrl: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  hidePoweredBy: boolean;
}

export const BRAND_DEFAULTS: Readonly<BrandDto> = {
  brandName: null,
  logoAssetId: null,
  logoDarkAssetId: null,
  faviconAssetId: null,
  primaryColor: '#7c3aed',
  theme: {},
  emailFromName: null,
  emailTemplatePack: 'default',
  supportUrl: null,
  termsUrl: null,
  privacyUrl: null,
  hidePoweredBy: false,
};

export interface BrandingResolveDto {
  orgSlug: string;
  brand: BrandDto;
  localeDefault: string;
}

interface BrandRow {
  brandName: string | null;
  logoAssetId: string | null;
  logoDarkAssetId: string | null;
  faviconAssetId: string | null;
  primaryColor: string;
  theme: unknown;
  emailFromName: string | null;
  emailTemplatePack: string;
  supportUrl: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  hidePoweredBy: boolean;
}

export function toBrandDto(row: BrandRow): BrandDto {
  return {
    brandName: row.brandName,
    logoAssetId: row.logoAssetId,
    logoDarkAssetId: row.logoDarkAssetId,
    faviconAssetId: row.faviconAssetId,
    primaryColor: row.primaryColor,
    theme: isRecordOfStrings(row.theme) ? row.theme : {},
    emailFromName: row.emailFromName,
    emailTemplatePack: row.emailTemplatePack,
    supportUrl: row.supportUrl,
    termsUrl: row.termsUrl,
    privacyUrl: row.privacyUrl,
    hidePoweredBy: row.hidePoweredBy,
  };
}

function isRecordOfStrings(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class BrandingService {
  constructor(
    @Inject(PRISMA) private readonly db: DbClient,
    @Inject(TENANT_CLIENT) private readonly tenant: TenantClientFactory,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    private readonly audit: AuditService,
    private readonly ops: DomainOperations,
  ) {}

  async getBrand(orgId: string): Promise<BrandDto> {
    return this.ops.measure(MODULE, 'brand.get', async () => {
      const row = await this.tenant(this.db, orgId).organizationBrand.findFirst({ where: { orgId } });
      return row === null ? { ...BRAND_DEFAULTS } : toBrandDto(row);
    });
  }

  /** Fail-closed whiteLabel check across subscription→plan.features. */
  private async assertWhiteLabelEntitled(orgId: string): Promise<void> {
    const subscription = await this.tenant(this.db, orgId).subscription.findFirst({
      where: { orgId },
      include: { plan: { select: { features: true } } },
    });
    const features = subscription === null ? null : parsePlanFeatures(subscription.plan.features);
    if (features === null || !hasFeature(features, 'whiteLabel')) {
      throw apiErrors.flagLocked('whiteLabel');
    }
  }

  private async assertOrgAssets(orgId: string, assetIds: string[]): Promise<void> {
    for (const assetId of assetIds) {
      const asset = await this.tenant(this.db, orgId).asset.findFirst({ where: { id: assetId }, select: { id: true } });
      if (asset === null) throw apiErrors.notFound('Asset');
    }
  }

  async putBrand(orgId: string, body: PutBrandBody): Promise<BrandDto> {
    return this.ops.measure(MODULE, 'brand.put', async () => {
      if (body.hidePoweredBy === true) await this.assertWhiteLabelEntitled(orgId);
      const assetIds = [body.logoAssetId, body.logoDarkAssetId, body.faviconAssetId].filter(
        (v): v is string => typeof v === 'string',
      );
      if (assetIds.length > 0) await this.assertOrgAssets(orgId, assetIds);

      const changed = Object.keys(body).filter((k) => Object.prototype.hasOwnProperty.call(body, k));
      return this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
        const data = {
          ...(Object.prototype.hasOwnProperty.call(body, 'brandName') ? { brandName: body.brandName ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'logoAssetId') ? { logoAssetId: body.logoAssetId ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'logoDarkAssetId') ? { logoDarkAssetId: body.logoDarkAssetId ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'faviconAssetId') ? { faviconAssetId: body.faviconAssetId ?? null } : {}),
          ...(body.primaryColor !== undefined ? { primaryColor: body.primaryColor } : {}),
          ...(body.theme !== undefined ? { theme: body.theme } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'emailFromName') ? { emailFromName: body.emailFromName ?? null } : {}),
          ...(body.emailTemplatePack !== undefined ? { emailTemplatePack: body.emailTemplatePack } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'supportUrl') ? { supportUrl: body.supportUrl ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'termsUrl') ? { termsUrl: body.termsUrl ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(body, 'privacyUrl') ? { privacyUrl: body.privacyUrl ?? null } : {}),
          ...(body.hidePoweredBy !== undefined ? { hidePoweredBy: body.hidePoweredBy } : {}),
        };
        const row = await tx.organizationBrand.upsert({
          where: { orgId },
          create: { id: generateId(), orgId, ...data },
          update: data,
        });
        await this.audit.record(tx, {
          orgId,
          action: 'brand.updated',
          entityType: 'OrganizationBrand',
          entityId: row.id,
          metadata: { changed },
        });
        await this.outbox.write(tx, [
          {
            type: 'aca.brand.updated',
            orgId,
            aggregateType: 'OrganizationBrand',
            aggregateId: row.id,
            payload: { orgId, changed, hidePoweredBy: row.hidePoweredBy },
          },
        ]);
        return toBrandDto(row);
      });
    });
  }

  /** Reset = delete the row (defaults apply downstream). */
  async resetBrand(orgId: string): Promise<BrandDto> {
    return this.ops.measure(MODULE, 'brand.reset', async () => {
      return this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
        const existing = await tx.organizationBrand.findFirst({ where: { orgId }, select: { id: true } });
        if (existing !== null) {
          await tx.organizationBrand.delete({ where: { id: existing.id } });
        }
        await this.audit.record(tx, {
          orgId,
          action: 'brand.reset',
          entityType: 'OrganizationBrand',
          entityId: existing?.id ?? null,
          metadata: {},
        });
        await this.outbox.write(tx, [
          { type: 'aca.brand.reset', orgId, aggregateType: 'Organization', aggregateId: orgId, payload: { orgId } },
        ]);
        return { ...BRAND_DEFAULTS };
      });
    });
  }

  /**
   * PUBLIC portal resolver (no tenant context): system client is REQUIRED
   * here — the host carries the tenant identity, there is no caller context.
   * Only ACTIVE PORTAL domains resolve; failures are a plain 404.
   */
  async resolveByHost(host: string): Promise<BrandingResolveDto> {
    return this.ops.measure(MODULE, 'brand.resolve', async () => {
      const normalized = host.trim().toLowerCase();
      const domain = await this.db.customDomain.findFirst({
        where: { domain: normalized, type: 'PORTAL', status: 'ACTIVE' },
        include: { organization: { select: { slug: true, defaultLocale: true, brand: true } } },
      });
      if (domain === null) throw apiErrors.notFound('brand');
      const org = domain.organization;
      return {
        orgSlug: org.slug,
        brand: org.brand === null ? { ...BRAND_DEFAULTS } : toBrandDto(org.brand),
        localeDefault: org.defaultLocale,
      };
    });
  }
}
