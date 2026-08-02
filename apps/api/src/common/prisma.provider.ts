/**
 * Prisma provider — ONE PrismaClient per process (ADR-025). Tenant scoping is
 * NOT applied here: services call `forOrganization(prisma, { organizationId })`
 * from @aca/database per operation; the guard layer deliberately uses the
 * system client (membership/subscription lookups ARE cross-tenant queries by
 * nature: "is THIS user in THIS org").
 */
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createPrismaClient, type DbClient } from '@aca/database';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: DbClient = createPrismaClient();

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

export const PRISMA = 'PRISMA';

/** Token-based provider (tests substitute a pg-mem or integration client). */
export const prismaProvider = {
  provide: PRISMA,
  useFactory: (service: PrismaService): DbClient => service.client,
  inject: [PrismaService],
};
