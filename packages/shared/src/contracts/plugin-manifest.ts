/**
 * Frozen contract C2 — Plugin Manifest (docs/Contracts.md).
 * The Plugin Registry is the provider catalog (Architecture §8): core code never
 * names a vendor; it resolves capabilities across installed/enabled manifests.
 * Consumers pin `contractMajor` — the platform supports N and N−1.
 */
import { z } from 'zod';
import { UuidSchema } from './events.js';

export const CapabilityKind = z.enum([
  'llm.chat',
  'llm.json',
  'llm.vision',
  'tts.synthesize',
  'image.generate',
  'stock.video.search',
  'stock.image.search',
  'music.search',
  'transcription.transcribe',
  'search.web',
  'publisher',
  'video-engine',
  'analytics.collector',
  'storage.object',
]);
export type CapabilityKind = z.infer<typeof CapabilityKind>;

/** Official semver 2.0.0 grammar (https://semver.org, unanchored). */
const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** `<namespace>.<slug>` — e.g. "pinterest.publisher", "openai".split('.') namespaces. */
export const PLUGIN_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,62}\.[a-z0-9][a-z0-9-]{0,62}$/;

export const SECRET_KEY_REGEX = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export const PluginCapabilitySchema = z.object({
  capability: CapabilityKind,
  /** Module specifier resolved inside the plugin package/sandbox. */
  entry: z.string().min(1).max(512),
  /** Router hint — drives cost-aware selection when objective is 'cheapest'. */
  costClass: z.enum(['low', 'medium', 'high']).optional(),
  /** BCP-47 tags the capability supports (omit = language-agnostic). */
  languages: z.array(z.string().min(2).max(35)).max(64).optional(),
  /** Concrete model ids the entry exposes (omit = single implicit model). */
  models: z.array(z.string().min(1).max(128)).max(64).optional(),
});
export type PluginCapability = z.infer<typeof PluginCapabilitySchema>;

export const PluginOAuthConfigSchema = z.object({
  authorizeUrl: z.string().url(),
  tokenUrl: z.string().url(),
  scopes: z.array(z.string().min(1).max(256)).min(1).max(64),
  pkce: z.enum(['required', 'optional', 'none']),
  /** How to resolve the connected channel's platformChannelId/profile after token exchange. */
  channelInfoPath: z.string().min(1).max(512).optional(),
});
export type PluginOAuthConfig = z.infer<typeof PluginOAuthConfigSchema>;

export const PluginRuntimeSchema = z.object({
  /** Hard per-invocation limit enforced by the plugins pool. */
  timeoutMs: z.number().int().positive().max(600_000),
  maxMemoryMB: z.number().int().positive().max(8192),
  /** Remote-plugin egress allowlist (hostnames, no wildcards) — enforced at the sandbox. */
  egressHosts: z.array(z.string().min(1).max(253)).max(128).optional(),
});
export type PluginRuntime = z.infer<typeof PluginRuntimeSchema>;

export const PluginPublisherSchema = z.object({
  name: z.string().min(1).max(128),
  /** Owning organization for marketplace plugins (omit for first-party). */
  orgId: UuidSchema.optional(),
  verified: z.boolean(),
});
export type PluginPublisher = z.infer<typeof PluginPublisherSchema>;

export const PluginManifestSchema = z.object({
  id: z.string().regex(PLUGIN_ID_REGEX, 'plugin id must be "<namespace>.<slug>", kebab-case'),
  /** Semver of the plugin package itself. */
  version: z.string().regex(SEMVER_REGEX, 'version must be semver 2.0.0'),
  /** Contracts major this plugin implements. v1 freeze ⇒ literal 1. */
  contractMajor: z.literal(1),
  displayName: z.string().min(1).max(128),
  publisher: PluginPublisherSchema,
  kind: z.enum(['builtin', 'npm', 'remote']),
  capabilities: z.array(PluginCapabilitySchema).min(1).max(32),
  /** JSON Schema for install-time config validation (unknown = provider-defined). */
  configSchema: z.unknown().optional(),
  /** Secret names stored in the token vault via provider_credentials — never in the manifest. */
  secretKeys: z.array(z.string().regex(SECRET_KEY_REGEX)).max(32).optional(),
  /** Publisher-capability plugins only (see validateManifest). */
  oauthConfig: PluginOAuthConfigSchema.optional(),
  runtime: PluginRuntimeSchema.optional(),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/* ------------------------------------------------------------------ */
/* Install-time validation                                             */
/* ------------------------------------------------------------------ */

export interface ManifestIssue {
  code: 'SCHEMA' | 'OAUTH_REQUIRED' | 'OAUTH_UNEXPECTED' | 'DUPLICATE_CAPABILITY';
  path: string;
  message: string;
}

export type ManifestValidationResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; issues: ManifestIssue[] };

/**
 * Structural (zod) + install-time invariant checks beyond the schema:
 * - 'publisher' capability ⇒ oauthConfig required;
 * - oauthConfig without a 'publisher' capability ⇒ rejected (C2: publisher kind only);
 * - duplicate (capability, entry) pairs ⇒ rejected.
 */
export function validateManifest(input: unknown): ManifestValidationResult {
  const parsed = PluginManifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        code: 'SCHEMA',
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }
  const manifest = parsed.data;
  const issues: ManifestIssue[] = [];

  const hasPublisher = manifest.capabilities.some((c) => c.capability === 'publisher');
  if (hasPublisher && manifest.oauthConfig === undefined) {
    issues.push({
      code: 'OAUTH_REQUIRED',
      path: 'oauthConfig',
      message: "manifest exposes the 'publisher' capability but declares no oauthConfig",
    });
  }
  if (!hasPublisher && manifest.oauthConfig !== undefined) {
    issues.push({
      code: 'OAUTH_UNEXPECTED',
      path: 'oauthConfig',
      message: "oauthConfig is only valid for manifests exposing the 'publisher' capability",
    });
  }

  const seen = new Set<string>();
  manifest.capabilities.forEach((c, idx) => {
    const key = `${c.capability}${c.entry}`;
    if (seen.has(key)) {
      issues.push({
        code: 'DUPLICATE_CAPABILITY',
        path: `capabilities[${idx}]`,
        message: `duplicate capability binding ${c.capability} → ${c.entry}`,
      });
    }
    seen.add(key);
  });

  return issues.length === 0 ? { ok: true, manifest } : { ok: false, issues };
}
