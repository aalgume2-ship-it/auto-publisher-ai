/**
 * Frozen contract C4 — Payment Provider (docs/Contracts.md).
 * Rule: no provider (Stripe/Paddle/…) payload ever crosses this boundary —
 * core consumes NormalizedBillingEvent only. All monetary values are integer cents.
 */
import { z } from 'zod';
import { UuidSchema } from './events.js';

export const ISO_CURRENCY_REGEX = /^[A-Z]{3}$/;

export type NormalizedBillingEvent =
  | {
      kind: 'checkout.completed';
      orgId: string;
      planCode: string;
      periodEnd: string;
      externalRef: string;
    }
  | {
      kind: 'subscription.activated' | 'subscription.canceled' | 'subscription.past_due';
      orgId: string;
      externalRef: string;
    }
  | {
      kind: 'invoice.paid' | 'invoice.failed';
      orgId: string;
      amountCents: number;
      currency: string;
      externalRef: string;
    }
  | {
      kind: 'credits.purchased';
      orgId: string;
      credits: number;
      amountCents: number;
      externalRef: string;
    };

export const SubscriptionSnapshotSchema = z.object({
  /** Provider-side subscription id. */
  externalRef: z.string().min(1).max(256),
  orgId: UuidSchema,
  planCode: z.string().min(1).max(64),
  status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'incomplete']),
  currentPeriodStart: z.string().datetime({ offset: false }).nullable(),
  currentPeriodEnd: z.string().datetime({ offset: false }).nullable(),
  cancelAtPeriodEnd: z.boolean(),
  seats: z.number().int().positive().max(10_000),
});
export type SubscriptionSnapshot = z.infer<typeof SubscriptionSnapshotSchema>;

export interface IPaymentProvider {
  /** e.g. "stripe" | "paddle" — matches billing config, never appears in core logic. */
  readonly id: string;

  createCheckout(req: {
    orgId: string;
    priceRef: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;

  /** Self-serve billing portal URL for the org's owner. */
  createPortal(orgId: string): Promise<{ url: string }>;

  /**
   * Signature-verifies the webhook (adapter-owned secret) and maps provider payloads
   * to normalized events. MUST be idempotent for duplicate deliveries.
   */
  verifyAndNormalizeWebhook(
    headers: Record<string, string>,
    rawBody: Buffer,
  ): Promise<NormalizedBillingEvent[]>;

  refund(externalRef: string, amountCents?: number): Promise<void>;

  /** Pull-based source of truth refresh (webhook reconciliation fallback). */
  syncSubscription(externalRef: string): Promise<SubscriptionSnapshot>;
}
