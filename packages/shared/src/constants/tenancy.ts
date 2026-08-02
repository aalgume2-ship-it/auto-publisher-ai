/**
 * Direct-org-scoped models → tenant field name (ADR-012/§6.2 of Architecture).
 * VALUES ARE PRISMA SCHEMA FIELD NAMES (mostly `orgId` — the @map("organization_id")
 * column name never appears here). CI gate: infra/scripts/check-tenancy-map.mjs.
 * Consumed by @aca/database (tenant extension) and by tests/docs — one map,
 * one truth. Models whose tenancy is inherited through a relation are scoped
 * via org-scoped parents (see @aca/database README).
 */
export const TENANT_FIELD = {
  Organization: 'id',
  OrganizationMember: 'orgId',
  OrganizationInvitation: 'orgId',
  Team: 'orgId',
  Department: 'orgId',
  CustomRole: 'orgId',
  OrganizationBrand: 'orgId',
  OrganizationBillingProfile: 'orgId',
  CustomDomain: 'orgId',
  SsoConnection: 'orgId',
  ScimToken: 'orgId',
  IpAllowListEntry: 'orgId',
  Subscription: 'orgId',
  Invoice: 'orgId',
  AiCreditTransaction: 'orgId',
  UsageRecord: 'orgId',
  ProviderCredential: 'orgId',
  Channel: 'orgId',
  Project: 'orgId',
  Asset: 'orgId',
  Video: 'orgId',
  PipelineRun: 'orgId',
  PublishingTask: 'orgId',
  MemoryEntry: 'orgId',
  AiMessage: 'orgId',
  PluginInstallation: 'orgId',
  MarketplacePurchase: 'buyerOrgId',
  DeveloperApp: 'ownerOrgId',
  ApiKey: 'orgId',
  WebhookEndpoint: 'orgId',
  AuditLog: 'orgId',
} as const;

export type TenantScopedModel = keyof typeof TENANT_FIELD;

export function tenantFieldFor(model: string): string | undefined {
  return (TENANT_FIELD as Record<string, string>)[model];
}
