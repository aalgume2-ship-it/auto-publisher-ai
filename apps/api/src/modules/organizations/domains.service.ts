/**
 * DomainsService — custom domain lifecycle (API.md §5, ADR-027: "structure
 * only where DNS verification is concerned" was lifted — verification is REAL:
 * node:dns TXT challenge lookup with a hard timeout, behind an injectable
 * DnsVerifier port so tests stay hermetic).
 *
 * v1 verification scope (honest): every domain type proves OWNERSHIP via
 * `_aca-challenge.<domain>` TXT = verificationToken. PORTAL additionally needs
 * its CNAME in place before the portal actually serves (cert issuance is a
 * worker concern — see module README failure modes). EMAIL_FROM DKIM/SPF
 * record checks land with the email provider adapter (@aca/email); the
 * ownership challenge is the gate for now.
 */
import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { Inject, Injectable } from '@nestjs/common';
import { generateId, type DbClient, type Prisma } from '@aca/database';
import { isUniqueViolation, type OutboxWriter } from '@aca/events';
import { apiErrors } from '../../common/errors/api-error.js';
import { PRISMA, TENANT_CLIENT, type TenantClientFactory } from '../../common/prisma.provider.js';
import { OUTBOX_WRITER } from '../../common/events/outbox.provider.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { DomainOperations } from '../../common/telemetry/domain-operations.js';
import type { CreateDomainBody } from './domains.dto.js';

const MODULE = 'organizations';
export const CHALLENGE_PREFIX = '_aca-challenge';
const DNS_TIMEOUT_MS = 4000;

/* ------------------------------------------------------------------------ */
/* DNS verifier port (node builtins only — no vendor SDK)                    */
/* ------------------------------------------------------------------------ */

export interface DnsVerifier {
  /** Flattened TXT record values for the host; empty when none resolve. */
  resolveTxtRecord(host: string): Promise<string[]>;
}

export class NodeDnsVerifier implements DnsVerifier {
  private readonly resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });

  async resolveTxtRecord(host: string): Promise<string[]> {
    try {
      const records = await this.resolver.resolveTxt(host);
      return records.map((chunks) => chunks.join(''));
    } catch {
      return []; // ENOTFOUND/ETIMEOUT/etc. — absence of proof, uniformly
    }
  }
}

export const DNS_VERIFIER = 'DNS_VERIFIER';

export const dnsVerifierProvider = {
  provide: DNS_VERIFIER,
  useClass: NodeDnsVerifier,
};

/* ------------------------------------------------------------------------ */

export type DomainType = 'PORTAL' | 'EMAIL_FROM';

export interface DomainDto {
  id: string;
  domain: string;
  type: DomainType;
  status: string;
  lastCheckedAt: Date | null;
  activatedAt: Date | null;
  createdAt: Date;
}

export interface DomainRegisteredDto extends DomainDto {
  verificationToken: string;
  instructions: string[];
}

interface DomainRow {
  id: string;
  domain: string;
  type: string;
  status: string;
  verificationToken: string;
  lastCheckedAt: Date | null;
  activatedAt: Date | null;
  createdAt: Date;
}

function toDomainDto(row: DomainRow): DomainDto {
  return {
    id: row.id,
    domain: row.domain,
    type: row.type as DomainType,
    status: row.status,
    lastCheckedAt: row.lastCheckedAt,
    activatedAt: row.activatedAt,
    createdAt: row.createdAt,
  };
}

export function buildInstructions(domain: string, type: DomainType, token: string): string[] {
  const lines = [
    `Create DNS TXT record: ${CHALLENGE_PREFIX}.${domain} = ${token}`,
    `Call POST /v1/organizations/{orgId}/domains/{id}/verify once DNS propagates (TTL permitting)`,
  ];
  if (type === 'PORTAL') {
    lines.splice(1, 0, `Point CNAME ${domain} -> portal.autocreator.ai (required for PORTAL type after verification)`);
  }
  return lines;
}

@Injectable()
export class DomainsService {
  constructor(
    @Inject(PRISMA) private readonly db: DbClient,
    @Inject(TENANT_CLIENT) private readonly tenant: TenantClientFactory,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(DNS_VERIFIER) private readonly dns: DnsVerifier,
    private readonly audit: AuditService,
    private readonly ops: DomainOperations,
  ) {}

  async listDomains(orgId: string): Promise<{ data: DomainDto[] }> {
    return this.ops.measure(MODULE, 'domain.list', async () => {
      const rows = await this.tenant(this.db, orgId).customDomain.findMany({ orderBy: { createdAt: 'desc' } });
      return { data: rows.map(toDomainDto) };
    });
  }

  async registerDomain(orgId: string, body: CreateDomainBody): Promise<DomainRegisteredDto> {
    return this.ops.measure(MODULE, 'domain.register', async () => {
      const token = `aca-verify=${randomBytes(24).toString('hex')}`;
      try {
        return await this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
          const row = await tx.customDomain.create({
            data: { id: generateId(), orgId, domain: body.domain, type: body.type, verificationToken: token },
          });
          await this.audit.record(tx, {
            orgId,
            action: 'domain.registered',
            entityType: 'CustomDomain',
            entityId: row.id,
            metadata: { domain: row.domain, type: row.type },
          });
          await this.outbox.write(tx, [
            {
              type: 'aca.domain.registered',
              orgId,
              aggregateType: 'CustomDomain',
              aggregateId: row.id,
              payload: { orgId, domainId: row.id, domain: row.domain, type: row.type },
            },
          ]);
          return { ...toDomainDto(row), verificationToken: token, instructions: buildInstructions(row.domain, body.type, token) };
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw apiErrors.conflict(`domain "${body.domain}" is already registered`);
        throw err;
      }
    });
  }

  /**
   * Real DNS ownership check. Failure is deliberate two-act behavior:
   *   act 1 (committed): status FAILED + lastCheckedAt + audit + domain.verification_failed event
   *   act 2: throw DOMAIN_VERIFICATION_FAILED (409) — the client learns the
   *          exact host and expected value (API.md §15 meta contract).
   */
  async verifyDomain(orgId: string, domainId: string): Promise<DomainDto> {
    return this.ops.measure(MODULE, 'domain.verify', async () => {
      const tenantDb = this.tenant(this.db, orgId);
      const domain = await tenantDb.customDomain.findFirst({ where: { id: domainId } });
      if (domain === null) throw apiErrors.notFound('CustomDomain');
      if (domain.status === 'ACTIVE') return toDomainDto(domain); // already verified — idempotent

      const challengeHost = `${CHALLENGE_PREFIX}.${domain.domain}`;
      const records = await this.dns.resolveTxtRecord(challengeHost);
      const matched = records.includes(domain.verificationToken);
      const now = new Date();

      if (!matched) {
        await tenantDb.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.customDomain.update({ where: { id: domainId }, data: { status: 'FAILED', lastCheckedAt: now } });
          await this.audit.record(tx, {
            orgId,
            action: 'domain.verification_failed',
            entityType: 'CustomDomain',
            entityId: domainId,
            metadata: { domain: domain.domain, host: challengeHost },
          });
          await this.outbox.write(tx, [
            {
              type: 'aca.domain.verification_failed',
              orgId,
              aggregateType: 'CustomDomain',
              aggregateId: domainId,
              payload: { orgId, domainId, domain: domain.domain, type: domain.type, expected: challengeHost },
            },
          ]);
        });
        throw apiErrors.domainVerificationFailed(challengeHost, domain.verificationToken);
      }

      return tenantDb.$transaction(async (tx: Prisma.TransactionClient) => {
        const row = await tx.customDomain.update({
          where: { id: domainId },
          data: { status: 'ACTIVE', lastCheckedAt: now, activatedAt: now },
        });
        await this.audit.record(tx, {
          orgId,
          action: 'domain.verified',
          entityType: 'CustomDomain',
          entityId: domainId,
          metadata: { domain: domain.domain, host: challengeHost },
        });
        await this.outbox.write(tx, [
          {
            type: 'aca.domain.verified',
            orgId,
            aggregateType: 'CustomDomain',
            aggregateId: domainId,
            payload: { orgId, domainId, domain: domain.domain, type: domain.type },
          },
        ]);
        return toDomainDto(row);
      });
    });
  }

  async deleteDomain(orgId: string, domainId: string): Promise<{ deleted: true }> {
    return this.ops.measure(MODULE, 'domain.delete', async () => {
      return this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
        const existing = await tx.customDomain.findFirst({ where: { id: domainId } });
        if (existing === null) throw apiErrors.notFound('CustomDomain');
        await tx.customDomain.delete({ where: { id: domainId } });
        await this.audit.record(tx, {
          orgId,
          action: 'domain.deleted',
          entityType: 'CustomDomain',
          entityId: domainId,
          metadata: { domain: existing.domain, type: existing.type },
        });
        await this.outbox.write(tx, [
          {
            type: 'aca.domain.deleted',
            orgId,
            aggregateType: 'CustomDomain',
            aggregateId: domainId,
            payload: { orgId, domainId, domain: existing.domain, type: existing.type },
          },
        ]);
        return { deleted: true as const };
      });
    });
  }
}
