/**
 * Custom domains — request contracts + OpenAPI doc schemas (API.md §5, ADR-027).
 */
import { z } from 'zod';
import { UuidV7Schema } from '@aca/shared';
import { OrgParamsSchema } from './organizations.dto.js';

const HOSTNAME = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const CreateDomainBody = z
  .object({
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(HOSTNAME, 'must be a lowercase hostname like portal.noor.example'),
    type: z.enum(['PORTAL', 'EMAIL_FROM']).default('PORTAL'),
  })
  .strict();
export type CreateDomainBody = z.infer<typeof CreateDomainBody>;

export const DomainParamsSchema = OrgParamsSchema.extend({ domainId: UuidV7Schema });

/* ---------------- OpenAPI documentation (real examples) ---------------- */

export const DomainDoc = {
  type: 'object' as const,
  properties: {
    id: { type: 'string', format: 'uuid', example: '01924d3a-2b3c-7d4e-9f5a-6b7c8d9e0f1a' },
    domain: { type: 'string', example: 'portal.noor.example' },
    type: { type: 'string', enum: ['PORTAL', 'EMAIL_FROM'], example: 'PORTAL' },
    status: { type: 'string', enum: ['PENDING_DNS', 'VERIFYING', 'ACTIVE', 'FAILED', 'SUSPENDED'], example: 'PENDING_DNS' },
    lastCheckedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
    activatedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
    createdAt: { type: 'string', format: 'date-time', example: '2026-08-02T09:30:00.000Z' },
  },
};

export const CreateDomainBodyDoc = {
  type: 'object' as const,
  required: ['domain'],
  properties: {
    domain: { type: 'string', example: 'portal.noor.example' },
    type: { type: 'string', enum: ['PORTAL', 'EMAIL_FROM'], example: 'PORTAL' },
  },
};

export const DomainRegisteredDoc = {
  type: 'object' as const,
  properties: {
    ...DomainDoc.properties,
    verificationToken: { type: 'string', example: 'aca-verify=7f3a9c1e2b4d5f6a8c9e0b1d2f3a4c5e' },
    instructions: {
      type: 'array',
      items: { type: 'string' },
      example: [
        'Create DNS TXT record: _aca-challenge.portal.noor.example = aca-verify=7f3a9c1e2b4d5f6a8c9e0b1d2f3a4c5e',
        'Point CNAME portal.noor.example -> portal.autocreator.ai (required for PORTAL type after verification)',
        'Call POST /v1/organizations/{orgId}/domains/{id}/verify once DNS propagates (TTL permitting)',
      ],
    },
  },
};
