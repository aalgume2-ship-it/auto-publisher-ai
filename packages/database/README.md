# @aca/database

Prisma schema (single source of truth, byte-identical to `docs/Database.md` §3),
tenant-scoped client factory, UUIDv7 id minting, partition helpers.

```ts
const db = createPrismaClient();
const tenantDb = forOrganization(db, { organizationId });
await tenantDb.video.findMany({ where: { status: 'PUBLISHED' } }); // org predicate injected
```

Rules enforced here and in CI (`test/tenancy.spec.ts`):
- ids are app-minted (`generateId()`); schema has no DB defaults;
- direct-org models cannot be read/written cross-tenant (`TenantViolationError`);
- relation-scoped models are reached via org-scoped parents (domain services);
- outbox writes happen in the same `$transaction` as domain mutations
  (`@aca/events/outbox` provides the helper).
