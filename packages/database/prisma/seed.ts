/**
 * AutoCreator AI — deterministic platform seed (docs/Database.md §7).
 *
 * Seeds are DATA, not code: every payload lives in ./seeds/*.json and is
 * validated against the frozen contracts from @aca/shared BEFORE any row is
 * written (workflow DAG via validateWorkflow, capability bindings via
 * PluginCapabilitySchema). A payload that fails validation aborts the whole
 * seed inside one transaction — the DB never sees half a catalog.
 *
 * Idempotent: safe to re-run; upserts on unique keys; system rows matched by
 * slug/key are refreshed in place (definition drift on autopilot-v1 is NOT
 * silently overwritten — template evolution is a deliberate migration).
 *
 * Requires: @aca/shared built (pnpm --filter @aca/shared build) and DATABASE_URL
 * pointing at a migrated PostgreSQL 16 + pgvector instance.
 *
 * Optional preview/demo data is seeded ONLY when SEED_DEMO_DATA=true.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  validateWorkflow,
  WorkflowDefinitionSchema,
  topologicalOrder,
  PluginCapabilitySchema,
} from '@aca/shared';
import { generateId } from '../src/id.js';

const here = dirname(fileURLToPath(import.meta.url));

function loadJson(rel: string): unknown {
  const raw = readFileSync(join(here, 'seeds', rel), 'utf8');
  return JSON.parse(raw) as unknown;
}

/* ------------------------------------------------------------------ */
/* Seed-file shapes ($comment keys are stripped by zod defaults)        */
/* ------------------------------------------------------------------ */

const PlanSeedSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(64),
  monthlyPriceCents: z.number().int().nonnegative(),
  yearlyPriceCents: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  providerPriceRefs: z.record(z.unknown()),
  aiCreditsMonthly: z.number().int().nonnegative(),
  maxChannels: z.number().int().positive(),
  maxProjects: z.number().int().positive(),
  maxVideosPerMonth: z.number().int().positive(),
  maxTeamMembers: z.number().int().positive(),
  maxStorageGb: z.number().int().positive(),
  renderQuality: z.string().min(1).max(32),
  isPublic: z.boolean(),
  features: z.record(z.unknown()),
});

const PluginSeedSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,62}$/),
  version: z.string().min(1),
  displayName: z.string().min(1).max(128),
  capabilityBindings: z.array(PluginCapabilitySchema).min(1),
  secretKeys: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)),
  configSchema: z.unknown(),
});

const VoiceSeedSchema = z.object({
  provider: z.string().min(1),
  providerVoiceId: z.string().min(1),
  name: z.string().min(1).max(64),
  // required-nullable (no .default): keeps z.infer props non-optional so the
  // object is assignable to Prisma inputs under exactOptionalPropertyTypes.
  gender: z.string().max(16).nullable(),
  languages: z.array(z.string().min(2).max(35)).min(1),
  style: z.string().max(128).nullable(),
  isPremium: z.boolean(),
});

const EmployeeSeedSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  role: z.enum([
    'CONTENT_MANAGER',
    'RESEARCHER',
    'SCRIPT_WRITER',
    'SEO_EXPERT',
    'THUMBNAIL_DESIGNER',
    'VOICE_DIRECTOR',
    'VIDEO_EDITOR',
    'PUBLISHER',
    'ANALYST',
    'GROWTH_MANAGER',
  ]),
  displayName: z.string().min(1).max(64),
});

const FlagSeedSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,125}$/),
  description: z.string().min(1).max(512),
  flagType: z.enum(['BOOLEAN', 'PERCENTAGE', 'VARIANT']),
  defaultValue: z.unknown(),
});

function parseFile<T>(schema: z.ZodType<T>, file: string, inner: (v: unknown) => unknown): T {
  const parsed = schema.safeParse(inner(loadJson(file)));
  if (!parsed.success) {
    throw new Error(
      `seed validation failed for prisma/seeds/${file}:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const plansFile = parseFile(
    z.object({ plans: z.array(PlanSeedSchema).min(1) }),
    'plans.json',
    (v) => v,
  );
  const pluginsFile = parseFile(
    z.object({ plugins: z.array(PluginSeedSchema).min(1) }),
    'plugin-registry.json',
    (v) => v,
  );
  const voicesFile = parseFile(
    z.object({ voices: z.array(VoiceSeedSchema).min(1) }),
    'voices.json',
    (v) => v,
  );
  const employeesFile = parseFile(
    z.object({ employees: z.array(EmployeeSeedSchema).length(10) }),
    'ai-employees.json',
    (v) => v,
  );
  const flagsFile = parseFile(
    z.object({ flags: z.array(FlagSeedSchema).min(1) }),
    'feature-flags.json',
    (v) => v,
  );

  // The system workflow definition is validated against the FROZEN contract —
  // exactly what the workflow engine will accept at publish time.
  const workflowDef = WorkflowDefinitionSchema.parse(loadJson('autopilot-v1.workflow.json'));
  const check = validateWorkflow(workflowDef);
  if (!check.valid) {
    throw new Error(
      `autopilot-v1 workflow invalid: ${check.issues.map((i) => `${i.code} ${i.message}`).join('; ')}`,
    );
  }
  const order = topologicalOrder(workflowDef);

  // Cross-file referential integrity: every capability a seeded plugin binds
  // must be a contract capability; voice providers must be seeded plugins.
  const pluginSlugs = new Set(pluginsFile.plugins.map((p) => p.slug));
  for (const voice of voicesFile.voices) {
    if (!pluginSlugs.has(voice.provider)) {
      throw new Error(`voice "${voice.name}" references unseeded provider plugin "${voice.provider}"`);
    }
  }

  const prisma = new PrismaClient();
  const stats: Record<string, number> = {};

  try {
    // The whole seed is ONE interactive transaction so a partial seed can never
    // leak into a database. Cross-region previews (e.g. Render Oregon → Supabase
    // Mumbai, ~250 ms/statement) blow past Prisma's 5 s default tx timeout, so
    // allow generous bounds here — bounded work, idempotent by design.
    await prisma.$transaction(async (tx) => {
      /* ---- Plans (Business-Model §4) ---- */
      for (const plan of plansFile.plans) {
        await tx.plan.upsert({
          where: { code: plan.code },
          update: {
            name: plan.name,
            monthlyPriceCents: plan.monthlyPriceCents,
            yearlyPriceCents: plan.yearlyPriceCents,
            currency: plan.currency,
            providerPriceRefs: plan.providerPriceRefs as Prisma.InputJsonValue,
            aiCreditsMonthly: plan.aiCreditsMonthly,
            maxChannels: plan.maxChannels,
            maxProjects: plan.maxProjects,
            maxVideosPerMonth: plan.maxVideosPerMonth,
            maxTeamMembers: plan.maxTeamMembers,
            maxStorageGb: plan.maxStorageGb,
            renderQuality: plan.renderQuality,
            features: plan.features as Prisma.InputJsonValue,
            isPublic: plan.isPublic,
          },
          create: {
            id: generateId(),
            code: plan.code,
            name: plan.name,
            monthlyPriceCents: plan.monthlyPriceCents,
            yearlyPriceCents: plan.yearlyPriceCents,
            currency: plan.currency,
            providerPriceRefs: plan.providerPriceRefs as Prisma.InputJsonValue,
            aiCreditsMonthly: plan.aiCreditsMonthly,
            maxChannels: plan.maxChannels,
            maxProjects: plan.maxProjects,
            maxVideosPerMonth: plan.maxVideosPerMonth,
            maxTeamMembers: plan.maxTeamMembers,
            maxStorageGb: plan.maxStorageGb,
            renderQuality: plan.renderQuality,
            features: plan.features as Prisma.InputJsonValue,
            isPublic: plan.isPublic,
          },
        });
      }
      stats.plans = plansFile.plans.length;

      /* ---- Plugin registry (Database.md §7) ---- */
      for (const plugin of pluginsFile.plugins) {
        const data = {
          kind: 'BUILTIN' as const,
          displayName: plugin.displayName,
          publisherName: 'AutoCreator AI',
          publisherOrgId: null,
          publisherVerified: true,
          capabilityBindings: plugin.capabilityBindings as unknown as Prisma.InputJsonValue,
          configSchema: (plugin.configSchema ?? {}) as Prisma.InputJsonValue,
          secretKeys: plugin.secretKeys,
          artifactRef: `builtin:${plugin.slug}`,
          status: 'ACTIVE' as const,
        };
        await tx.pluginRecord.upsert({
          where: { slug_version: { slug: plugin.slug, version: plugin.version } },
          update: data,
          create: { id: generateId(), slug: plugin.slug, version: plugin.version, ...data },
        });
      }
      stats.plugins = pluginsFile.plugins.length;

      /* ---- Voice catalog ---- */
      for (const voice of voicesFile.voices) {
        const data = {
          name: voice.name,
          gender: voice.gender,
          languages: voice.languages,
          style: voice.style,
          isPremium: voice.isPremium,
        };
        await tx.voice.upsert({
          where: {
            provider_providerVoiceId: {
              provider: voice.provider,
              providerVoiceId: voice.providerVoiceId,
            },
          },
          update: data,
          create: {
            id: generateId(),
            provider: voice.provider,
            providerVoiceId: voice.providerVoiceId,
            ...data,
          },
        });
      }
      stats.voices = voicesFile.voices.length;

      /* ---- System AI employees (orgId null = system default; compound unique
             with NULL cannot upsert → findFirst + update/create) ---- */
      for (const emp of employeesFile.employees) {
        const existing = await tx.aiEmployee.findFirst({ where: { orgId: null, key: emp.key } });
        if (existing) {
          await tx.aiEmployee.update({
            where: { id: existing.id },
            data: { role: emp.role, displayName: emp.displayName, enabled: true },
          });
        } else {
          await tx.aiEmployee.create({
            data: {
              id: generateId(),
              orgId: null,
              key: emp.key,
              role: emp.role,
              displayName: emp.displayName,
              enabled: true,
            },
          });
        }
      }
      stats.aiEmployees = employeesFile.employees.length;

      /* ---- Feature flags + per-plugin kill-switches ---- */
      const allFlags = [
        ...flagsFile.flags,
        ...pluginsFile.plugins.map((p) => ({
          key: `plugins.${p.slug}`,
          description: `Kill-switch: ${p.displayName} adapter (health flap / incident).`,
          flagType: 'BOOLEAN' as const,
          defaultValue: true as unknown,
        })),
      ];
      for (const flag of allFlags) {
        await tx.featureFlag.upsert({
          where: { key: flag.key },
          update: { description: flag.description, flagType: flag.flagType, defaultValue: flag.defaultValue as Prisma.InputJsonValue },
          create: {
            id: generateId(),
            key: flag.key,
            description: flag.description,
            flagType: flag.flagType,
            defaultValue: flag.defaultValue as Prisma.InputJsonValue,
          },
        });
      }
      stats.featureFlags = allFlags.length;

      /* ---- System workflow template "autopilot-v1" ---- */
      const existingTemplate = await tx.workflow.findFirst({
        where: { orgId: null, slug: 'autopilot-v1' },
        include: { versions: { orderBy: { version: 'asc' } } },
      });
      if (!existingTemplate) {
        const workflowId = generateId();
        const versionId = generateId();
        await tx.workflow.create({
          data: {
            id: workflowId,
            orgId: null,
            slug: 'autopilot-v1',
            name: 'Autopilot — 15-Step Pipeline',
            description:
              'System template: the exact 15-step pipeline (trend research → script → fact-check → SEO → voice → scenes → assets → render → subtitles → thumbnails → QC → publish → analytics → optimizer). Review gates are compiled at run launch per reviewMode.',
            isTemplate: true,
            status: 'PUBLISHED',
            versions: {
              create: {
                id: versionId,
                version: 1,
                definition: workflowDef as unknown as Prisma.InputJsonValue,
                changelog: 'Initial system template (docs/AI-Pipeline.md).',
                publishedAt: new Date(),
              },
            },
          },
        });
        await tx.workflow.update({
          where: { id: workflowId },
          data: { currentVersionId: versionId },
        });
        stats.workflowTemplate = 1;
      } else if (existingTemplate.versions.length === 0) {
        throw new Error('autopilot-v1 exists without any version — manual repair required');
      }

      /* ---- Optional preview workspace data (opt-in only) ---- */
      if (process.env.SEED_DEMO_DATA === 'true') {
        stats.previewWorkspace = await seedPreviewWorkspace(tx);
      }
    }, { timeout: 600_000, maxWait: 30_000 });
  } finally {
    await prisma.$disconnect();
  }

  console.log('✔ seed complete (idempotent) —', {
    ...stats,
    autopilotV1: { nodes: order.length, order },
    previewWorkspaceSeeded: process.env.SEED_DEMO_DATA === 'true',
  });
}

/* ------------------------------------------------------------------ */
/* Optional preview workspace (SEED_DEMO_DATA=true only)               */
/* ------------------------------------------------------------------ */

type SeedTx = Prisma.TransactionClient;

async function seedPreviewWorkspace(tx: SeedTx): Promise<number> {
  let created = 0;

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'owner@example.local';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Workspace Owner';
  const workspaceName = process.env.SEED_WORKSPACE_NAME ?? 'Preview Workspace';
  const workspaceSlug = process.env.SEED_WORKSPACE_SLUG ?? 'preview-workspace';

  const demoUser =
    (await tx.user.findUnique({ where: { email: adminEmail } })) ??
    (await tx.user.create({
      data: {
        id: generateId(),
        email: adminEmail,
        emailVerifiedAt: new Date(),
        passwordHash: null,
        displayName: adminName,
        locale: 'en',
        timezone: 'UTC',
        status: 'ACTIVE',
      },
    }));

  let org = await tx.organization.findUnique({ where: { slug: workspaceSlug } });
  if (!org) {
    org = await tx.organization.create({
      data: {
        id: generateId(),
        name: workspaceName,
        slug: workspaceSlug,
        status: 'ACTIVE',
        billingCustomerRefs: {},
        billingProvider: 'local',
        timezone: 'UTC',
        defaultLocale: 'en',
        securityPolicy: {},
      },
    });
    created += 1;
  }

  const membership = await tx.organizationMember.findFirst({
    where: { orgId: org.id, userId: demoUser.id },
  });
  if (!membership) {
    await tx.organizationMember.create({
      data: { id: generateId(), orgId: org.id, userId: demoUser.id, role: 'OWNER', status: 'ACTIVE' },
    });
    created += 1;
  }

  // Preview wiring aid (dev-only path): surfaced in deploy logs so an operator can
  // mint demo-session JWTs locally without direct database access.
  console.log(`[seed:preview] ${JSON.stringify({ previewUserId: demoUser.id, previewOrgId: org.id })}`);

  const proPlan = await tx.plan.findUniqueOrThrow({ where: { code: 'pro' } });
  const subscription = await tx.subscription.findUnique({ where: { orgId: org.id } });
  if (!subscription) {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await tx.subscription.create({
      data: {
        id: generateId(),
        orgId: org.id,
        planId: proPlan.id,
        provider: 'local',
        externalSubscriptionId: null,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        trialEndsAt: null,
      },
    });
    created += 1;
  }

  // Monthly grant only when the ledger is empty (never double-grant on re-seed).
  const txCount = await tx.aiCreditTransaction.count({ where: { orgId: org.id } });
  if (txCount === 0) {
    await tx.aiCreditTransaction.create({
      data: {
        id: generateId(),
        orgId: org.id,
        delta: proPlan.aiCreditsMonthly,
        balanceAfter: proPlan.aiCreditsMonthly,
        reason: 'MONTHLY_GRANT',
        note: 'seed: initial pro-plan grant for preview workspace',
      },
    });
    created += 1;
  }

  const project = await tx.project.findFirst({ where: { orgId: org.id, name: 'Starter Project' } });
  if (!project) {
    const nova = await tx.voice.findFirst({
      where: { provider: 'openai-tts', providerVoiceId: 'nova' },
    });
    await tx.project.create({
      data: {
        id: generateId(),
        orgId: org.id,
        visibility: 'ORG_WIDE',
        name: 'Starter Project',
        description: 'Optional preview workspace project — attach a channel and run autopilot-v1.',
        niche: 'technology',
        language: 'en',
        targetPlatforms: ['youtube', 'tiktok', 'instagram'],
        aspectRatio: 'RATIO_9_16',
        stylePreset: {},
        defaultVoiceId: nova?.id ?? null,
        workflowId: null, // null → system autopilot-v1
        routingObjective: 'BALANCED',
        isArchived: false,
      },
    });
    created += 1;
  }

  return created;
}

main().catch((err: unknown) => {
  console.error('✖ seed failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
