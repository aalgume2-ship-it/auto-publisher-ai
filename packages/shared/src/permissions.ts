/**
 * Capability-based RBAC (ADR-012): guards evaluate capabilities, never role names.
 * This catalog is the ONLY source of permission strings — Security.md §6 derives
 * from it (and the CI rbac-matrix suite treats this map as the test fixture).
 */
export const PERMISSIONS = [
  // organization & billing
  'org.manage',
  'billing.view',
  'billing.manage',
  // members / teams / roles
  'member.invite',
  'member.remove',
  'member.role.manage',
  'team.manage',
  'role.custom.manage',
  // channels
  'channel.view',
  'channel.connect',
  'channel.disconnect',
  // projects & automation
  'project.view',
  'project.create',
  'project.edit',
  'project.archive',
  'automation.configure',
  // videos & pipeline
  'video.view',
  'video.create',
  'video.edit',
  'video.delete',
  'pipeline.run',
  'pipeline.review',
  'pipeline.cancel',
  'publish.execute',
  // assets & voices
  'asset.view',
  'asset.upload',
  'asset.delete',
  // workflows & plugins & memory
  'workflow.view',
  'workflow.manage',
  'plugin.view',
  'plugin.manage',
  'memory.view',
  'memory.manage',
  // analytics
  'analytics.view',
  'analytics.export',
  // platform admin-ish org settings
  'apikey.manage',
  'webhook.manage',
  'audit.view',
  'brand.manage',
  'domain.manage',
  'sso.manage',
  'scim.manage',
  'security.policy.manage',
  // marketplace & developer platform
  'marketplace.publish',
  'marketplace.purchase',
  'developer.app.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type SystemRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';

const VIEWER: readonly Permission[] = [
  'billing.view',
  'channel.view',
  'project.view',
  'video.view',
  'asset.view',
  'workflow.view',
  'plugin.view',
  'memory.view',
  'analytics.view',
  'analytics.export',
  'audit.view',
];

const EDITOR: readonly Permission[] = [
  ...VIEWER,
  'project.create',
  'project.edit',
  'project.archive',
  'automation.configure',
  'video.create',
  'video.edit',
  'video.delete',
  'pipeline.run',
  'pipeline.review',
  'pipeline.cancel',
  'publish.execute',
  'asset.upload',
  'asset.delete',
  'workflow.manage',
  'memory.manage',
  'marketplace.publish',
];

const ADMIN: readonly Permission[] = [
  ...EDITOR,
  'member.invite',
  'member.remove',
  'member.role.manage',
  'team.manage',
  'role.custom.manage',
  'channel.connect',
  'channel.disconnect',
  'plugin.manage',
  'apikey.manage',
  'webhook.manage',
  'brand.manage',
  'developer.app.manage',
  'marketplace.purchase',
  'org.manage',
];

const OWNER: readonly Permission[] = [
  ...ADMIN,
  'billing.manage',
  'domain.manage',
  'sso.manage',
  'scim.manage',
  'security.policy.manage',
];

export const ROLE_CAPABILITIES: Readonly<Record<SystemRole, readonly Permission[]>> = {
  OWNER,
  ADMIN,
  EDITOR,
  VIEWER,
};

/**
 * Effective = system-role baseline ∪ custom-role grants (ADR-012).
 * Removal of capabilities from a custom role takes effect on next evaluation
 * (flag/permission cache TTL ≤ 60 s, invalidated by membership-changed events).
 */
export function resolveEffectivePermissions(
  systemRole: SystemRole,
  customRolePermissions: readonly Permission[] = [],
): ReadonlySet<Permission> {
  return new Set<Permission>([...ROLE_CAPABILITIES[systemRole], ...customRolePermissions]);
}

export function hasPermission(effective: ReadonlySet<Permission>, p: Permission): boolean {
  return effective.has(p);
}
