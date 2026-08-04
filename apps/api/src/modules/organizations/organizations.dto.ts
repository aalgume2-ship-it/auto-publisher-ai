/**
 * Organizations module — request contracts (zod = runtime truth) + OpenAPI
 * documentation schemas with REAL examples, kept side-by-side deliberately:
 * when a field changes here, its documentation changes in the same diff.
 */
import { z } from 'zod';
import { UuidV7Schema } from '@aca/shared';

/* ------------------------------------------------------------------ */
/* shared primitives                                                    */
/* ------------------------------------------------------------------ */

/** IANA zone check via the runtime's own Intl database (no hand-maintained list). */
function isValidTimeZone(value: string): boolean {
  if (value === 'UTC') return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const TimezoneSchema = z
  .string()
  .min(2)
  .max(64)
  .refine(isValidTimeZone, 'must be a valid IANA time zone (e.g. "Asia/Riyadh")');

export const LocaleSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'BCP-47 short form like "en" or "en-US"')
  .max(10);

export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/, 'lowercase alphanumerics and hyphens, cannot start/end with hyphen')
  .min(2)
  .max(80);

/** Deterministic slug derivation for auto-generated slugs. */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics (NFKD residue)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'org' : slug;
}

export const OrgParamsSchema = z.object({ orgId: UuidV7Schema });

/* ------------------------------------------------------------------ */
/* organizations                                                        */
/* ------------------------------------------------------------------ */

export const CreateOrganizationBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: SlugSchema.optional(),
    timezone: TimezoneSchema.optional(),
    defaultLocale: LocaleSchema.optional(),
  })
  .strict();
export type CreateOrganizationBody = z.infer<typeof CreateOrganizationBody>;

export const UpdateOrganizationBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    timezone: TimezoneSchema.optional(),
    defaultLocale: LocaleSchema.optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'at least one field is required');
export type UpdateOrganizationBody = z.infer<typeof UpdateOrganizationBody>;

export const UpdateSettingsBody = z
  .object({
    timezone: TimezoneSchema.optional(),
    defaultLocale: LocaleSchema.optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'at least one field is required');
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBody>;

export const SecurityPolicyBody = z
  .object({
    enforceSso: z.boolean().optional(),
    enforceMfa: z.boolean().optional(),
    sessionMaxHours: z.number().int().min(1).max(720).optional(),
    ipAllowListEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'at least one field is required');
export type SecurityPolicyBody = z.infer<typeof SecurityPolicyBody>;

/* ------------------------------------------------------------------ */
/* OpenAPI documentation schemas (real examples)                        */
/* ------------------------------------------------------------------ */

export const OrganizationDoc = {
  type: 'object' as const,
  properties: {
    id: { type: 'string', format: 'uuid', example: '01924d3a-7c2f-7b8e-9f1a-2c3d4e5f6a7b' },
    name: { type: 'string', example: 'Noor Media Holding' },
    slug: { type: 'string', example: 'noor-media-holding' },
    status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'], example: 'ACTIVE' },
    timezone: { type: 'string', example: 'Asia/Riyadh' },
    defaultLocale: { type: 'string', example: 'ar-SA' },
    createdAt: { type: 'string', format: 'date-time', example: '2026-08-02T09:30:00.000Z' },
    updatedAt: { type: 'string', format: 'date-time', example: '2026-08-02T09:30:00.000Z' },
    counts: {
      type: 'object',
      properties: {
        members: { type: 'integer', example: 4 },
        teams: { type: 'integer', example: 2 },
        departments: { type: 'integer', example: 1 },
      },
    },
  },
};

export const CreateOrganizationBodyDoc = {
  type: 'object' as const,
  required: ['name'],
  properties: {
    name: { type: 'string', example: 'Noor Media Holding' },
    slug: { type: 'string', example: 'noor-media-holding' },
    timezone: { type: 'string', example: 'Asia/Riyadh' },
    defaultLocale: { type: 'string', example: 'ar-SA' },
  },
};

export const UpdateOrganizationBodyDoc = {
  type: 'object' as const,
  properties: {
    name: { type: 'string', example: 'Noor Media Group' },
    timezone: { type: 'string', example: 'Asia/Dubai' },
    defaultLocale: { type: 'string', example: 'en' },
  },
};

export const UpdateSettingsBodyDoc = {
  type: 'object' as const,
  properties: {
    timezone: { type: 'string', example: 'Asia/Riyadh' },
    defaultLocale: { type: 'string', example: 'ar-SA' },
  },
};

export const SecurityPolicyBodyDoc = {
  type: 'object' as const,
  properties: {
    enforceSso: { type: 'boolean', example: true },
    enforceMfa: { type: 'boolean', example: true },
    sessionMaxHours: { type: 'integer', minimum: 1, maximum: 720, example: 12 },
    ipAllowListEnabled: { type: 'boolean', example: false },
  },
};

export const OrganizationMembershipDoc = {
  type: 'object' as const,
  properties: {
    role: { type: 'string', enum: ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'], example: 'OWNER' },
    status: { type: 'string', enum: ['ACTIVE', 'INVITED', 'REMOVED'], example: 'ACTIVE' },
    joinedAt: { type: 'string', format: 'date-time', example: '2026-08-02T09:30:00.000Z' },
    organization: OrganizationDoc,
  },
};

export const OrganizationMembershipListDoc = {
  type: 'object' as const,
  properties: {
    items: { type: 'array', items: OrganizationMembershipDoc },
  },
};

export const SettingsDoc = {
  type: 'object' as const,
  properties: {
    timezone: { type: 'string', example: 'Asia/Riyadh' },
    defaultLocale: { type: 'string', example: 'ar-SA' },
    securityPolicy: {
      type: 'object',
      example: { enforceSso: false, enforceMfa: true, sessionMaxHours: 24, ipAllowListEnabled: false },
    },
  },
};
