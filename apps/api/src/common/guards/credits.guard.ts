/**
 * CreditsGuard — guard 5/5 (ADR-025 chain). AI-credit PRE-CHECK only:
 * `@RequiresCredits(estimate)` rejects early with CREDIT_INSUFFICIENT when the
 * org balance cannot cover the route's estimated cost. The actual debit is a
 * service-layer transaction paired with the domain write (ADR-025) — never
 * here (guards must be idempotent and side-effect free).
 *
 * Balance = balanceAfter of the most recent AiCreditTransaction for the org
 * (the ledger is append-only; latest row IS the balance).
 */
import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { DbClient } from '@aca/database';
import { apiErrors } from '../errors/api-error.js';
import { requestContext } from '../context/request-context.js';
import { PRISMA } from '../prisma.provider.js';

export const REQUIRED_CREDITS_KEY = 'aca:required-credits';
export const RequiresCredits = (estimate: number) => SetMetadata(REQUIRED_CREDITS_KEY, estimate);

/** Pure credit decision (unit-tested directly). */
export function decideCredits(balance: number, estimate: number): void {
  if (!Number.isInteger(estimate) || estimate < 0) {
    throw new Error(`RequiresCredits estimate must be a non-negative integer, got ${estimate}`);
  }
  if (balance < estimate) {
    throw apiErrors.creditInsufficient(estimate, balance);
  }
}

@Injectable()
export class CreditsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PRISMA) private readonly prisma: DbClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const estimate = this.reflector.getAllAndOverride<number>(REQUIRED_CREDITS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (estimate === undefined) return true;

    const ctx = requestContext();
    if (ctx.organizationId === null) {
      throw apiErrors.forbidden('credit check requires a tenant-scoped route');
    }

    const latest = await this.prisma.aiCreditTransaction.findFirst({
      where: { orgId: ctx.organizationId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });
    decideCredits(latest?.balanceAfter ?? 0, estimate);
    return true;
  }
}
