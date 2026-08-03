/**
 * OrgCredentialsService — per-organization secret vault built on the existing
 * `provider_credentials` table (AES-256-GCM envelope via @aca/auth, same
 * construction as the channel token vault). Two namespaces today:
 *   capability LLM        → AI text provider API keys (script stage)
 *   capability PUBLISHER  → the org's own Google OAuth client (id/secret)
 * Resolution always prefers the org vault over process env, so a tenant
 * pasting a key in /dashboard/settings takes effect with zero redeploys.
 * Fail-closed: without SECRETS_MASTER_KEY nothing is stored or read.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '@aca/config';
import { SecretEnvelope, keyringFromHex } from '@aca/auth';
import { generateId, type DbClient } from '@aca/database';
import { PRISMA } from '../prisma.provider.js';
import { API_CONFIG } from '../redis.provider.js';
import { ApiError } from '../errors/api-error.js';
import { LLM_PROVIDERS, LLM_PROVIDER_MAP, type LlmCredential, type LlmProviderDef } from '../../modules/ai/providers.js';

export type VaultCapability = 'LLM' | 'PUBLISHER';
const GOOGLE_OAUTH_PROVIDER = 'google-oauth';
const VAULT_LABEL = 'primary';

interface VaultPayload {
  secret: string;
  hint: string;
  validatedAt: string;
  [k: string]: unknown;
}

export interface GoogleClientCreds {
  clientId: string;
  clientSecret: string;
  source: 'org' | 'env';
}

@Injectable()
export class OrgCredentialsService {
  constructor(
    @Inject(API_CONFIG) private readonly config: AppConfig,
    @Inject(PRISMA) private readonly prisma: DbClient,
  ) {}

  private vault(): SecretEnvelope {
    const key = this.config.secrets.masterKey;
    if (!key) {
      throw new ApiError('PLATFORM_ERROR', 'Service Unavailable', {
        status: 503,
        detail: 'Secrets vault key not configured: set SECRETS_MASTER_KEY (64-hex) on the API service — required to store org provider keys encrypted at rest.',
      });
    }
    return new SecretEnvelope(keyringFromHex(key, this.config.secrets.masterKeyId));
  }

  static hint(secret: string): string {
    return secret.length <= 8 ? '…' + secret.slice(-4) : `${secret.slice(0, 3)}…${secret.slice(-4)}`;
  }

  /** Decrypted payload or null (missing / revoked). */
  async readSecret(orgId: string, capability: VaultCapability, provider: string): Promise<VaultPayload | null> {
    const row = await this.prisma.providerCredential.findUnique({
      where: { orgId_capability_provider_label: { orgId, capability, provider, label: VAULT_LABEL } },
    });
    if (!row || row.status !== 'ACTIVE') return null;
    try {
      return JSON.parse(this.vault().decrypt(row.ciphertext)) as VaultPayload;
    } catch {
      return null; // master key rotated away — treat as absent, never crash reads
    }
  }

  async writeSecret(orgId: string, capability: VaultCapability, provider: string, payload: VaultPayload): Promise<void> {
    const packed = this.vault().encrypt(JSON.stringify(payload));
    await this.prisma.providerCredential.upsert({
      where: { orgId_capability_provider_label: { orgId, capability, provider, label: VAULT_LABEL } },
      create: {
        id: generateId(),
        orgId,
        capability,
        provider,
        label: VAULT_LABEL,
        ciphertext: packed.ciphertext,
        keyId: packed.keyId,
      },
      update: { ciphertext: packed.ciphertext, keyId: packed.keyId, status: 'ACTIVE', revokedAt: null },
    });
  }

  /** Hard delete — a revoked key must not linger in the vault. */
  async deleteSecret(orgId: string, capability: VaultCapability, provider: string): Promise<boolean> {
    const res = await this.prisma.providerCredential.deleteMany({
      where: { orgId, capability, provider, label: VAULT_LABEL },
    });
    return res.count > 0;
  }

  /** Which providers currently have an org-vault credential (hints only). */
  async listNamespace(orgId: string, capability: VaultCapability): Promise<Array<{ provider: string; hint: string; validatedAt: string | null }>> {
    const rows = await this.prisma.providerCredential.findMany({
      where: { orgId, capability, label: VAULT_LABEL, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    const out: Array<{ provider: string; hint: string; validatedAt: string | null }> = [];
    for (const row of rows) {
      let hint = '';
      let validatedAt: string | null = null;
      try {
        const payload = JSON.parse(this.vault().decrypt(row.ciphertext)) as VaultPayload;
        hint = payload.hint ?? '';
        validatedAt = payload.validatedAt ?? null;
      } catch {
        hint = '(unreadable)';
      }
      out.push({ provider: row.provider, hint, validatedAt });
    }
    return out;
  }

  /* ------------------------------------------------------------- resolvers */

  /** env fallback map — provider id → configured key (if any). */
  private envKeyFor(def: LlmProviderDef): string | null {
    const ai = this.config.ai;
    const map: Record<string, string | undefined> = {
      openai: ai.openaiApiKey,
      groq: ai.groqApiKey,
      gemini: ai.geminiApiKey,
      openrouter: ai.openrouterApiKey,
      pollinations: ai.pollinationsApiKey,
    };
    const v = map[def.id];
    return v && v.length > 0 ? v : null;
  }

  /** The LLM credential the pipeline will use, org vault first, env second. */
  async resolveLlm(orgId: string): Promise<LlmCredential | null> {
    for (const def of LLM_PROVIDERS) {
      const stored = await this.readSecret(orgId, 'LLM', def.id);
      if (stored?.secret) return { def, apiKey: stored.secret, source: 'org' };
    }
    for (const def of LLM_PROVIDERS) {
      const env = this.envKeyFor(def);
      if (env) return { def, apiKey: env, source: 'env' };
    }
    return null;
  }

  /** Which env key would activate a given provider (for guidance strings). */
  static envKeyOf(providerId: string): string {
    return LLM_PROVIDER_MAP.get(providerId)?.envKey ?? providerId.toUpperCase();
  }

  /** Google OAuth client for channel linking: org vault → env → null. */
  async resolveGoogleOAuth(orgId: string): Promise<GoogleClientCreds | null> {
    const stored = await this.readSecret(orgId, 'PUBLISHER', GOOGLE_OAUTH_PROVIDER);
    const clientId = typeof stored?.['clientId'] === 'string' ? (stored['clientId'] as string) : '';
    const clientSecret = typeof stored?.['clientSecret'] === 'string' ? (stored['clientSecret'] as string) : '';
    if (stored && clientId && clientSecret) return { clientId, clientSecret, source: 'org' };
    const { googleClientId, googleClientSecret } = this.config.platforms;
    if (googleClientId && googleClientSecret) return { clientId: googleClientId, clientSecret: googleClientSecret, source: 'env' };
    return null;
  }

  async saveGoogleOAuth(orgId: string, clientId: string, clientSecret: string): Promise<void> {
    await this.writeSecret(orgId, 'PUBLISHER', GOOGLE_OAUTH_PROVIDER, {
      secret: clientSecret,
      clientId,
      clientSecret,
      hint: OrgCredentialsService.hint(clientId),
      validatedAt: new Date().toISOString(),
    });
  }

  async deleteGoogleOAuth(orgId: string): Promise<boolean> {
    return this.deleteSecret(orgId, 'PUBLISHER', GOOGLE_OAUTH_PROVIDER);
  }
}
