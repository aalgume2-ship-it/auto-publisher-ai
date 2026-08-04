/**
 * Billing profile + subscription read — contracts + OpenAPI docs (API.md §4.5).
 */
import { z } from 'zod';
import { UuidV7Schema } from '@aca/shared';
import { OrgParamsSchema } from './organizations.dto.js';

export const BillingProfileBody = z
  .object({
    legalName: z.string().trim().min(1).max(200).nullable().optional(),
    billingEmail: z.string().email().max(320).optional(),
    taxId: z.string().trim().min(1).max(64).nullable().optional(),
    addressLine1: z.string().trim().min(1).max(200).nullable().optional(),
    addressLine2: z.string().trim().min(1).max(200).nullable().optional(),
    city: z.string().trim().min(1).max(120).nullable().optional(),
    state: z.string().trim().min(1).max(120).nullable().optional(),
    postalCode: z.string().trim().min(1).max(32).nullable().optional(),
    countryCode: z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2 like SA or AE').nullable().optional(),
    purchaseOrderRef: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'at least one field is required');
export type BillingProfileBody = z.infer<typeof BillingProfileBody>;

export type BillingParams = z.infer<typeof OrgParamsSchema>;

export const CheckoutSessionBody = z.object({
  planCode: z.string().trim().min(1).max(32),
  interval: z.enum(['month', 'year']).default('month'),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});
export type CheckoutSessionBody = z.infer<typeof CheckoutSessionBody>;

/* ---------------- OpenAPI documentation (real examples) ---------------- */

export const BillingProfileDoc = {
  type: 'object' as const,
  properties: {
    legalName: { type: 'string', nullable: true, example: 'Noor Media Holding LLC' },
    billingEmail: { type: 'string', nullable: true, example: 'billing@noor.example' },
    taxId: { type: 'string', nullable: true, example: '310123456700003' },
    addressLine1: { type: 'string', nullable: true, example: 'King Fahd Rd 123' },
    addressLine2: { type: 'string', nullable: true, example: 'Tower 4, Floor 9' },
    city: { type: 'string', nullable: true, example: 'Riyadh' },
    state: { type: 'string', nullable: true, example: 'Riyadh Region' },
    postalCode: { type: 'string', nullable: true, example: '12214' },
    countryCode: { type: 'string', nullable: true, example: 'SA' },
    purchaseOrderRef: { type: 'string', nullable: true, example: 'PO-2026-0142' },
  },
};

export const PutBillingProfileBodyDoc = {
  type: 'object' as const,
  properties: BillingProfileDoc.properties,
};

export const SubscriptionDoc = {
  type: 'object' as const,
  properties: {
    status: { type: 'string', enum: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'UNPAID'], example: 'TRIALING' },
    provider: { type: 'string', example: 'stripe' },
    currentPeriodStart: { type: 'string', format: 'date-time', example: '2026-08-01T00:00:00.000Z' },
    currentPeriodEnd: { type: 'string', format: 'date-time', example: '2026-09-01T00:00:00.000Z' },
    cancelAtPeriodEnd: { type: 'boolean', example: false },
    trialEndsAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-08-15T00:00:00.000Z' },
    plan: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'pro' },
        name: { type: 'string', example: 'Pro' },
        monthlyPriceCents: { type: 'integer', example: 4900 },
        yearlyPriceCents: { type: 'integer', example: 47000 },
        currency: { type: 'string', example: 'USD' },
        aiCreditsMonthly: { type: 'integer', example: 5000 },
        maxChannels: { type: 'integer', example: 10 },
        maxProjects: { type: 'integer', example: 25 },
        maxVideosPerMonth: { type: 'integer', example: 300 },
        maxTeamMembers: { type: 'integer', example: 15 },
        maxStorageGb: { type: 'integer', example: 500 },
      },
    },
  },
};

export const SubscriptionResponseDoc = {
  type: 'object' as const,
  properties: {
    subscription: SubscriptionDoc,
    credits: {
      type: 'object',
      properties: {
        balance: { type: 'integer', example: 4820, description: 'AI credits; 0 when no ledger rows exist yet' },
      },
    },
  },
};

export const CheckoutSessionBodyDoc = {
  type: 'object' as const,
  required: ['planCode', 'interval', 'successUrl', 'cancelUrl'],
  properties: {
    planCode: { type: 'string', example: 'pro' },
    interval: { type: 'string', enum: ['month', 'year'], example: 'month' },
    successUrl: { type: 'string', format: 'uri', example: 'https://app.example.com/dashboard/billing/?checkout=success' },
    cancelUrl: { type: 'string', format: 'uri', example: 'https://app.example.com/dashboard/billing/?checkout=cancel' },
  },
};

export const CheckoutSessionDoc = {
  type: 'object' as const,
  properties: {
    provider: { type: 'string', example: 'stripe' },
    url: { type: 'string', format: 'uri', example: 'https://checkout.stripe.com/c/pay/...' },
    sessionId: { type: 'string', example: 'cs_test_a1b2c3' },
    publishableKey: { type: 'string', nullable: true, example: 'pk_test_123' },
  },
};

export const BillingPlansDoc = {
  type: 'object' as const,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'pro' },
          name: { type: 'string', example: 'Pro' },
          monthlyPriceCents: { type: 'integer', example: 7900 },
          yearlyPriceCents: { type: 'integer', example: 79000 },
          currency: { type: 'string', example: 'USD' },
          aiCreditsMonthly: { type: 'integer', example: 5000 },
          isPublic: { type: 'boolean', example: true },
        },
      },
    },
  },
};
