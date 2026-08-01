/**
 * Direct-org-scoped models → tenant field name (ADR-012/§6.2 of Architecture).
 * Consumed by @aca/database (tenant extension) and by tests/docs — one map,
 * one truth. Models whose tenancy is inherited through a relation are scoped
 * via org-scoped parents (see @aca/database README).
 */
export const TENANT_FIELD = {
  Organization: 'id',
  OrganizationMember: 'organizationId',
  OrganizationInvitation: 'organizationId',
  Team: 'organizationId',
  CustomRole: 'organizationId',
  OrganizationBrand: 'organizationId',
  CustomDomain: 'organizationId',
  SsoConnection: 'organizationId',
  ScimToken: 'organizationId',
  IpAllowListEntry: 'organizationId',
  Subscription: 'organizationId',
  Invoice: 'organizationId',
  AiCreditTransaction: 'organizationId',
  UsageRecord: 'organizationId',
  ProviderCredential: 'organizationId',
  Channel: 'organizationId',
  Project: 'organizationId',
  Asset: 'organizationId',
  Video: 'organizationId',
  PipelineRun: 'organizationId',
  PublishingTask: 'organizationId',
  MemoryEntry: 'organizationId',
  AiMessage: 'organizationId',
  PluginInstallation: 'organizationId',
  MarketplacePurchase: 'buyerOrgId',
  DeveloperApp: 'ownerOrgId',
  ApiKey: 'organizationId',
  WebhookEndpoint: 'organizationId',
  AuditLog: 'organizationId',
} as const;

export type TenantScopedModel = keyof typeof TENANT_FIELD;

export function tenantFieldFor(model: string): string | undefined {
  return (TENANT_FIELD as Record<string, string>)[model];
}
