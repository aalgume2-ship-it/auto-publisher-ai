/**
 * Branding — request contracts + OpenAPI doc schemas (API.md §5 white label).
 */
import { z } from 'zod';
import { UuidV7Schema } from '@aca/shared';

export const PutBrandBody = z
  .object({
    brandName: z.string().trim().min(1).max(120).nullable().optional(),
    logoAssetId: UuidV7Schema.nullable().optional(),
    logoDarkAssetId: UuidV7Schema.nullable().optional(),
    faviconAssetId: UuidV7Schema.nullable().optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex color like #7c3aed').optional(),
    theme: z.record(z.string().min(1).max(80), z.string().max(200)).optional(),
    emailFromName: z.string().trim().min(1).max(120).nullable().optional(),
    emailTemplatePack: z.string().trim().min(1).max(64).optional(),
    supportUrl: z.string().url().max(500).nullable().optional(),
    termsUrl: z.string().url().max(500).nullable().optional(),
    privacyUrl: z.string().url().max(500).nullable().optional(),
    hidePoweredBy: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'at least one field is required');
export type PutBrandBody = z.infer<typeof PutBrandBody>;

export const BrandingResolveQuery = z
  .object({ host: z.string().trim().min(4).max(253) })
  .strict();
export type BrandingResolveQuery = z.infer<typeof BrandingResolveQuery>;

/* ---------------- OpenAPI documentation (real examples) ---------------- */

export const BrandDoc = {
  type: 'object' as const,
  properties: {
    brandName: { type: 'string', nullable: true, example: 'Noor Podcasts' },
    logoAssetId: { type: 'string', format: 'uuid', nullable: true, example: '01924d3a-1a2b-7c3d-8e4f-5a6b7c8d9e0f' },
    logoDarkAssetId: { type: 'string', format: 'uuid', nullable: true, example: null },
    faviconAssetId: { type: 'string', format: 'uuid', nullable: true, example: null },
    primaryColor: { type: 'string', example: '#7c3aed' },
    theme: { type: 'object', example: { 'color-scheme': 'dark', 'font-display': 'IBM Plex Sans Arabic' } },
    emailFromName: { type: 'string', nullable: true, example: 'Noor Media' },
    emailTemplatePack: { type: 'string', example: 'default' },
    supportUrl: { type: 'string', nullable: true, example: 'https://support.noor.example' },
    termsUrl: { type: 'string', nullable: true, example: 'https://noor.example/terms' },
    privacyUrl: { type: 'string', nullable: true, example: 'https://noor.example/privacy' },
    hidePoweredBy: { type: 'boolean', example: false },
  },
};

export const PutBrandBodyDoc = {
  type: 'object' as const,
  properties: BrandDoc.properties,
};

export const BrandingResolveDoc = {
  type: 'object' as const,
  properties: {
    orgSlug: { type: 'string', example: 'noor-media-holding' },
    brand: BrandDoc,
    localeDefault: { type: 'string', example: 'ar-SA' },
  },
};
