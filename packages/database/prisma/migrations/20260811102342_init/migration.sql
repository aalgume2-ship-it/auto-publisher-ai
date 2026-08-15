-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'EMAIL', 'OIDC', 'SSO_SAML');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProjectVisibility" AS ENUM ('ORG_WIDE', 'TEAM_ONLY');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('CONNECTED', 'TOKEN_EXPIRED', 'REVOKED', 'SYNC_ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('VIDEO_CLIP', 'IMAGE', 'AUDIO', 'MUSIC', 'VOICEOVER', 'THUMBNAIL', 'SUBTITLE', 'RENDER_LOG', 'BRAND');

-- CreateEnum
CREATE TYPE "AssetSource" AS ENUM ('UPLOADED', 'GENERATED', 'STOCK', 'SYSTEM', 'MARKETPLACE');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('DRAFT', 'QUEUED', 'GENERATING', 'AWAITING_REVIEW', 'READY', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AspectRatio" AS ENUM ('RATIO_9_16', 'RATIO_16_9', 'RATIO_1_1', 'RATIO_4_5');

-- CreateEnum
CREATE TYPE "ReviewMode" AS ENUM ('FULL_AUTO', 'REVIEW_SCRIPT', 'REVIEW_MEDIA', 'REVIEW_FINAL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'AWAITING_REVIEW', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepRunStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RunTrigger" AS ENUM ('MANUAL', 'AUTOPILOT', 'RETRY', 'API', 'OPTIMIZER', 'WORKFLOW');

-- CreateEnum
CREATE TYPE "PublishTaskStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'UPLOADING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'ACTIVE', 'COMPLETED', 'FAILED', 'DELAYED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImageGenStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DubbingStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignPostStatus" AS ENUM ('SCHEDULED', 'GENERATING', 'READY', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IdeaSource" AS ENUM ('TREND', 'MANUAL', 'OPTIMIZER', 'API', 'WORKFLOW');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('NEW', 'APPROVED', 'REJECTED', 'USED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'UNPAID');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "CreditReason" AS ENUM ('MONTHLY_GRANT', 'PURCHASE', 'PIPELINE_CONSUMPTION', 'STORAGE_CONSUMPTION', 'ADJUSTMENT', 'REFUND', 'MARKETPLACE_FEE');

-- CreateEnum
CREATE TYPE "RenderStatus" AS ENUM ('PENDING', 'RENDERING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PIPELINE', 'PUBLISHING', 'BILLING', 'SECURITY', 'SYSTEM', 'MARKETPLACE', 'TEAM');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'API_KEY', 'SYSTEM', 'OAUTH_APP', 'SCIM');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ExperimentType" AS ENUM ('THUMBNAIL_AB', 'METADATA_AB');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('RUNNING', 'CONCLUDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProviderCapability" AS ENUM ('LLM', 'TTS', 'IMAGE', 'STOCK_VIDEO', 'STOCK_IMAGE', 'MUSIC', 'TRANSCRIPTION', 'SEARCH', 'PUBLISHER', 'VIDEO_ENGINE', 'STORAGE', 'ANALYTICS');

-- CreateEnum
CREATE TYPE "DomainType" AS ENUM ('PORTAL', 'EMAIL_FROM');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING_DNS', 'VERIFYING', 'ACTIVE', 'FAILED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SsoProtocol" AS ENUM ('SAML', 'OIDC');

-- CreateEnum
CREATE TYPE "SsoStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "FlagType" AS ENUM ('BOOLEAN', 'PERCENTAGE', 'VARIANT');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PluginKind" AS ENUM ('BUILTIN', 'NPM', 'REMOTE');

-- CreateEnum
CREATE TYPE "PluginStatus" AS ENUM ('ACTIVE', 'DEPRECATED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ListingKind" AS ENUM ('TEMPLATE', 'VOICE', 'PROMPT', 'AGENT', 'PLUGIN', 'WORKFLOW', 'BRAND_PACK');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('FREE', 'ONE_TIME', 'SUBSCRIPTION', 'REVENUE_SHARE');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('COMPLETED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "MemoryScope" AS ENUM ('CHANNEL', 'PROJECT', 'ORG');

-- CreateEnum
CREATE TYPE "MemorySubject" AS ENUM ('HOOK_STYLE', 'WRITING_STYLE', 'DURATION', 'POST_TIME', 'THUMBNAIL_STYLE', 'TOPIC', 'MUSIC', 'VOICE', 'HASHTAG', 'FORMAT', 'FREQUENCY', 'AUDIENCE');

-- CreateEnum
CREATE TYPE "MemoryStatus" AS ENUM ('ACTIVE', 'DECAYED', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MemorySource" AS ENUM ('OPTIMIZER', 'ANALYST', 'USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('CONTENT_MANAGER', 'RESEARCHER', 'SCRIPT_WRITER', 'SEO_EXPERT', 'THUMBNAIL_DESIGNER', 'VOICE_DIRECTOR', 'VIDEO_EDITOR', 'PUBLISHER', 'ANALYST', 'GROWTH_MANAGER');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('BRIEF', 'HANDOFF', 'FEEDBACK', 'APPROVAL_REQUEST', 'REPORT', 'NOTE');

-- CreateEnum
CREATE TYPE "DeveloperAppStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RoutingObjective" AS ENUM ('QUALITY_FIRST', 'BALANCED', 'CHEAPEST', 'FASTEST', 'PINNED');

-- CreateEnum
CREATE TYPE "DeadLetterStatus" AS ENUM ('OPEN', 'REPLAYED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "IdempotencyState" AS ENUM ('IN_FLIGHT', 'COMPLETED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "password_hash" TEXT,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "anonymized_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "totp_secret_enc" TEXT,
    "totp_secret_key_id" TEXT,
    "mfa_enabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "sso_connection_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "previous_refresh_token_hash" TEXT,
    "previous_rotated_at" TIMESTAMP(3),
    "device_name" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "auth_method" TEXT NOT NULL DEFAULT 'password',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "billing_customer_refs" JSONB NOT NULL DEFAULT '{}',
    "billing_provider" TEXT NOT NULL DEFAULT 'stripe',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "security_policy" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MemberRole" NOT NULL,
    "custom_role_id" UUID,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "custom_role_id" UUID,
    "team_ids" UUID[],
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_roles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_brands" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "brand_name" TEXT,
    "logo_asset_id" UUID,
    "logo_dark_asset_id" UUID,
    "favicon_asset_id" UUID,
    "primary_color" TEXT NOT NULL DEFAULT '#7c3aed',
    "theme" JSONB NOT NULL DEFAULT '{}',
    "email_from_name" TEXT,
    "email_template_pack" TEXT NOT NULL DEFAULT 'default',
    "support_url" TEXT,
    "terms_url" TEXT,
    "privacy_url" TEXT,
    "hide_powered_by" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_domains" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "type" "DomainType" NOT NULL DEFAULT 'PORTAL',
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING_DNS',
    "verification_token" TEXT NOT NULL,
    "dkim_selectors" JSONB,
    "last_checked_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "protocol" "SsoProtocol" NOT NULL,
    "domains" TEXT[],
    "idp_metadata_url" TEXT,
    "idp_metadata_xml" TEXT,
    "oidc_issuer" TEXT,
    "oidc_client_id" TEXT,
    "oidc_secret_enc" TEXT,
    "oidc_secret_key_id" TEXT,
    "enforced" BOOLEAN NOT NULL DEFAULT false,
    "jit_provisioning" BOOLEAN NOT NULL DEFAULT true,
    "default_role_id" UUID,
    "attribute_mapping" JSONB,
    "status" "SsoStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scim_tokens" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scim_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_allowlist_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cidr" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_allowlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_price_cents" INTEGER NOT NULL,
    "yearly_price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "provider_price_refs" JSONB NOT NULL DEFAULT '{}',
    "ai_credits_monthly" INTEGER NOT NULL,
    "max_channels" INTEGER NOT NULL,
    "max_projects" INTEGER NOT NULL,
    "max_videos_per_month" INTEGER NOT NULL,
    "max_team_members" INTEGER NOT NULL,
    "max_storage_gb" INTEGER NOT NULL,
    "renderQuality" TEXT NOT NULL DEFAULT 'standard',
    "features" JSONB NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "external_subscription_id" TEXT,
    "status" "SubscriptionStatus" NOT NULL,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "trial_ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_billing_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "legal_name" TEXT,
    "billing_email" TEXT NOT NULL,
    "tax_id" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "country_code" TEXT,
    "purchase_order_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_billing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "external_invoice_id" TEXT,
    "number" TEXT,
    "amount_due_cents" INTEGER NOT NULL,
    "amount_paid_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "InvoiceStatus" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "pdf_storage_key" TEXT,
    "issued_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_credit_transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "pipeline_step_run_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "period_month" TEXT NOT NULL,
    "videos_generated" INTEGER NOT NULL DEFAULT 0,
    "videos_published" INTEGER NOT NULL DEFAULT 0,
    "render_seconds" INTEGER NOT NULL DEFAULT 0,
    "ai_credits_used" INTEGER NOT NULL DEFAULT 0,
    "storage_bytes" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_credentials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "capability" "ProviderCapability" NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "plugin_installation_id" UUID,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "platform_channel_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "handle" TEXT,
    "avatar_url" TEXT,
    "status" "ChannelStatus" NOT NULL DEFAULT 'CONNECTED',
    "scopes" TEXT[],
    "followers" BIGINT,
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_credentials" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "team_id" UUID,
    "visibility" "ProjectVisibility" NOT NULL DEFAULT 'ORG_WIDE',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "niche" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "target_platforms" TEXT[],
    "aspectRatio" "AspectRatio" NOT NULL DEFAULT 'RATIO_9_16',
    "stylePreset" JSONB NOT NULL,
    "default_voice_id" UUID,
    "workflow_id" UUID,
    "routing_objective" "RoutingObjective" NOT NULL DEFAULT 'BALANCED',
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_configs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "review_mode" "ReviewMode" NOT NULL DEFAULT 'REVIEW_FINAL',
    "posts_per_day" INTEGER NOT NULL DEFAULT 1,
    "postingWindows" JSONB NOT NULL,
    "topic_keywords" TEXT[],
    "negative_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cron_expression" TEXT,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_snapshots" (
    "id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "category" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "velocity" DOUBLE PRECISION NOT NULL,
    "volume" INTEGER,
    "metadata" JSONB,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideas" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source" "IdeaSource" NOT NULL,
    "title" TEXT NOT NULL,
    "angle" TEXT,
    "outline" JSONB,
    "score" DOUBLE PRECISION,
    "status" "IdeaStatus" NOT NULL DEFAULT 'NEW',
    "trend_keyword" TEXT,
    "evidence" JSONB,
    "embedding" vector(1536),
    "selected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "idea_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "aspectRatio" "AspectRatio" NOT NULL DEFAULT 'RATIO_9_16',
    "target_platforms" TEXT[],
    "status" "VideoStatus" NOT NULL DEFAULT 'DRAFT',
    "duration_ms" INTEGER,
    "seo" JSONB,
    "hook" TEXT,
    "cta" TEXT,
    "tags" TEXT[],
    "visibility_default" TEXT NOT NULL DEFAULT 'public',
    "ai_disclosure" BOOLEAN NOT NULL DEFAULT true,
    "quality_score" DOUBLE PRECISION,
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scripts" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "beats" JSONB NOT NULL,
    "word_count" INTEGER NOT NULL,
    "reading_seconds" INTEGER NOT NULL,
    "factuality_score" DOUBLE PRECISION,
    "seo_score" DOUBLE PRECISION,
    "claims" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voiceovers" (
    "id" UUID NOT NULL,
    "script_id" UUID NOT NULL,
    "voice_id" UUID NOT NULL,
    "audio_asset_id" UUID NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "word_timings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voiceovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voices" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_voice_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "languages" TEXT[],
    "style" TEXT,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "preview_asset_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "narration_text" TEXT NOT NULL,
    "visual_prompt" TEXT,
    "asset_id" UUID,
    "start_ms" INTEGER NOT NULL,
    "end_ms" INTEGER NOT NULL,
    "transition" TEXT,
    "overlay" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "AssetType" NOT NULL,
    "source" "AssetSource" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "cdn_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "checksum" TEXT,
    "duration_ms" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "license" TEXT,
    "source_url" TEXT,
    "metadata" JSONB,
    "expires_at" TIMESTAMP(3),
    "embedding" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_blobs" (
    "storage_key" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_blobs_pkey" PRIMARY KEY ("storage_key")
);

-- CreateTable
CREATE TABLE "asset_usage" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "context" TEXT NOT NULL,

    CONSTRAINT "asset_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_renditions" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "profile" TEXT NOT NULL,
    "storage_key" TEXT,
    "bytes" BIGINT,
    "duration_ms" INTEGER,
    "status" "RenderStatus" NOT NULL DEFAULT 'PENDING',
    "render_logs_key" TEXT,
    "spec_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "video_renditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtitle_tracks" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "word_level" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subtitle_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thumbnails" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "variant" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "layout" JSONB,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "ctr" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thumbnails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version_id" UUID,
    "origin_listing_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_versions" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "changelog" TEXT,
    "published_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "workflow_version_id" UUID NOT NULL,
    "trigger_source" "RunTrigger" NOT NULL,
    "triggered_by_id" UUID,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "state_version" INTEGER NOT NULL DEFAULT 0,
    "current_node_id" TEXT,
    "review_mode" "ReviewMode" NOT NULL,
    "routing_objective" "RoutingObjective" NOT NULL DEFAULT 'BALANCED',
    "credit_budget" INTEGER,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "brief" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_step_runs" (
    "id" UUID NOT NULL,
    "pipeline_run_id" UUID NOT NULL,
    "node_id" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" "StepRunStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB,
    "output" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "prompt_version" TEXT,
    "memory_ids" UUID[],
    "tokens_prompt" INTEGER,
    "tokens_completion" INTEGER,
    "cost_micros" BIGINT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error" TEXT,
    "bull_job_id" TEXT,

    CONSTRAINT "pipeline_step_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_records" (
    "id" UUID NOT NULL,
    "bull_job_id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts_made" INTEGER NOT NULL DEFAULT 0,
    "failed_reason" TEXT,
    "processed_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "trace_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" UUID NOT NULL,
    "consumer" TEXT NOT NULL,
    "event_id" UUID NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_events" (
    "id" UUID NOT NULL,
    "consumer" TEXT NOT NULL,
    "event_id" UUID NOT NULL,
    "stream" TEXT NOT NULL,
    "stream_entry_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "organization_id" UUID,
    "envelope" JSONB NOT NULL,
    "error" TEXT NOT NULL,
    "attempts_total" INTEGER NOT NULL,
    "first_failed_at" TIMESTAMP(3) NOT NULL,
    "last_failed_at" TIMESTAMP(3) NOT NULL,
    "status" "DeadLetterStatus" NOT NULL DEFAULT 'OPEN',
    "replayed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dead_letter_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumer_cursors" (
    "consumer" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "last_committed_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumer_cursors_pkey" PRIMARY KEY ("consumer","stream")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actor_hash" TEXT NOT NULL,
    "organization_id" UUID,
    "request_hash" TEXT NOT NULL,
    "state" "IdempotencyState" NOT NULL DEFAULT 'IN_FLIGHT',
    "status_code" INTEGER,
    "response_body" TEXT,
    "locked_until" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishing_tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "rendition_profile" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "status" "PublishTaskStatus" NOT NULL DEFAULT 'SCHEDULED',
    "platform_video_id" TEXT,
    "platform_url" TEXT,
    "platform_post_id" TEXT,
    "title_override" TEXT,
    "description_override" TEXT,
    "hashtags" TEXT[],
    "attempts_made" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publishing_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_generations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "negative_prompt" TEXT,
    "style" TEXT,
    "aspect_ratio" TEXT NOT NULL DEFAULT '9:16',
    "resolution" TEXT NOT NULL DEFAULT '720x1280',
    "count" INTEGER NOT NULL DEFAULT 1,
    "status" "ImageGenStatus" NOT NULL DEFAULT 'QUEUED',
    "asset_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failure_reason" TEXT,
    "created_by_id" UUID,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dubbing_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "source_language" TEXT NOT NULL DEFAULT 'ar',
    "target_language" TEXT NOT NULL,
    "voice_id" UUID,
    "status" "DubbingStatus" NOT NULL DEFAULT 'QUEUED',
    "output_rendition_id" UUID,
    "failure_reason" TEXT,
    "created_by_id" UUID,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dubbing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "platforms" TEXT[],
    "cadence" TEXT NOT NULL DEFAULT 'daily',
    "time_of_day" TEXT NOT NULL DEFAULT '18:00',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "content_mode" TEXT NOT NULL DEFAULT 'auto',
    "reference_image_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" "CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "next_run_at" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_posts" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "channel_id" UUID,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" "CampaignPostStatus" NOT NULL DEFAULT 'SCHEDULED',
    "video_id" UUID,
    "image_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "caption" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "published_task_id" UUID,
    "failure_reason" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_analytics_daily" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" BIGINT NOT NULL DEFAULT 0,
    "followers" BIGINT,
    "followers_delta" INTEGER,
    "videos_published" INTEGER NOT NULL DEFAULT 0,
    "watch_seconds" BIGINT NOT NULL DEFAULT 0,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_analytics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_analytics_daily" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "publishing_task_id" UUID,
    "platform" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" BIGINT NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "watch_seconds" BIGINT NOT NULL DEFAULT 0,
    "avg_view_duration_sec" DOUBLE PRECISION,
    "avg_percent_watched" DOUBLE PRECISION,
    "impressions" BIGINT,
    "ctr" DOUBLE PRECISION,
    "followers_gained" INTEGER,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_analytics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "optimization_reports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "insights" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "memory_delta" JSONB,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "optimization_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "type" "ExperimentType" NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_variants" (
    "id" UUID NOT NULL,
    "experiment_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "thumbnail_id" UUID,
    "metadata" JSONB,
    "impressions" BIGINT,
    "ctr" DOUBLE PRECISION,
    "watch_seconds" BIGINT,

    CONSTRAINT "experiment_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scope" "MemoryScope" NOT NULL,
    "channel_id" UUID,
    "project_id" UUID,
    "subject" "MemorySubject" NOT NULL,
    "content" TEXT NOT NULL,
    "structured" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.55,
    "evidence" JSONB,
    "source" "MemorySource" NOT NULL DEFAULT 'SYSTEM',
    "status" "MemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "supersedes_id" UUID,
    "embedding" vector(1536),
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_employees" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "key" TEXT NOT NULL,
    "role" "EmployeeRole" NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "persona_notes" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "origin_listing_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "pipeline_run_id" UUID,
    "video_id" UUID,
    "project_id" UUID,
    "from_employee_id" UUID,
    "from_role" "EmployeeRole" NOT NULL,
    "to_role" "EmployeeRole",
    "kind" "MessageKind" NOT NULL,
    "content" TEXT NOT NULL,
    "structured" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_registry" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "kind" "PluginKind" NOT NULL,
    "display_name" TEXT NOT NULL,
    "publisher_name" TEXT NOT NULL,
    "publisher_org_id" UUID,
    "publisher_verified" BOOLEAN NOT NULL DEFAULT false,
    "capability_bindings" JSONB NOT NULL,
    "config_schema" JSONB NOT NULL,
    "secret_keys" TEXT[],
    "artifact_ref" TEXT,
    "status" "PluginStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_installations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plugin_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "installed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugin_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_listings" (
    "id" UUID NOT NULL,
    "publisher_org_id" UUID,
    "kind" "ListingKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "artifact" JSONB NOT NULL,
    "price_type" "PriceType" NOT NULL DEFAULT 'FREE',
    "price_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "platform_share_pct" INTEGER NOT NULL DEFAULT 30,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "installs_count" INTEGER NOT NULL DEFAULT 0,
    "rating_avg" DOUBLE PRECISION,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_purchases" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "buyer_org_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "platform_fee_cents" INTEGER NOT NULL,
    "creator_share_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PurchaseStatus" NOT NULL DEFAULT 'COMPLETED',
    "provider_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_reviews" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "developer_apps" (
    "id" UUID NOT NULL,
    "owner_org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret_hash" TEXT NOT NULL,
    "redirect_uris" TEXT[],
    "scopes" TEXT[],
    "status" "DeveloperAppStatus" NOT NULL DEFAULT 'ACTIVE',
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "developer_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_authorization_codes" (
    "id" UUID NOT NULL,
    "app_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "redirect_uri" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_authorization_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_grants" (
    "id" UUID NOT NULL,
    "app_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "scopes" TEXT[],
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "flag_type" "FlagType" NOT NULL DEFAULT 'BOOLEAN',
    "default_value" JSONB NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag_overrides" (
    "id" UUID NOT NULL,
    "flag_id" UUID NOT NULL,
    "organization_id" UUID,
    "plan_code" TEXT,
    "user_id" UUID,
    "value" JSONB NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "developer_app_id" UUID,
    "url" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "events" TEXT[],
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "endpoint_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status_code" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "external_event_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "actor_id" UUID,
    "actor_type" "AuditActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email_pipeline" BOOLEAN NOT NULL DEFAULT true,
    "email_publish" BOOLEAN NOT NULL DEFAULT true,
    "email_billing" BOOLEAN NOT NULL DEFAULT true,
    "in_app_pipeline" BOOLEAN NOT NULL DEFAULT true,
    "in_app_publish" BOOLEAN NOT NULL DEFAULT true,
    "weekly_digest" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AutomationConfigToChannel" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "oauth_identities_user_id_idx" ON "oauth_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_identities_provider_provider_account_id_key" ON "oauth_identities"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_hash_key" ON "user_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_revoked_at_idx" ON "user_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_sessions_previous_refresh_token_hash_idx" ON "user_sessions"("previous_refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitations_token_hash_key" ON "organization_invitations"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitations_organization_id_email_key" ON "organization_invitations"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organization_id_slug_key" ON "departments"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "teams_department_id_idx" ON "teams"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_organization_id_name_key" ON "teams"("organization_id", "name");

-- CreateIndex
CREATE INDEX "team_members_user_id_idx" ON "team_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_team_id_user_id_key" ON "team_members"("team_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_roles_organization_id_name_key" ON "custom_roles"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "organization_brands_organization_id_key" ON "organization_brands"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_domains_domain_key" ON "custom_domains"("domain");

-- CreateIndex
CREATE INDEX "custom_domains_organization_id_type_idx" ON "custom_domains"("organization_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "sso_connections_organization_id_key" ON "sso_connections"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "scim_tokens_token_hash_key" ON "scim_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "ip_allowlist_entries_organization_id_cidr_key" ON "ip_allowlist_entries"("organization_id", "cidr");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organization_id_key" ON "subscriptions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_external_subscription_id_key" ON "subscriptions"("external_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_billing_profiles_organization_id_key" ON "organization_billing_profiles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_external_invoice_id_key" ON "invoices"("external_invoice_id");

-- CreateIndex
CREATE INDEX "invoices_organization_id_created_at_idx" ON "invoices"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_credit_transactions_organization_id_created_at_idx" ON "ai_credit_transactions"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_organization_id_period_month_key" ON "usage_records"("organization_id", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "provider_credentials_organization_id_capability_provider_la_key" ON "provider_credentials"("organization_id", "capability", "provider", "label");

-- CreateIndex
CREATE INDEX "channels_organization_id_status_idx" ON "channels"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "channels_organization_id_platform_platform_channel_id_key" ON "channels"("organization_id", "platform", "platform_channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_credentials_channel_id_key" ON "channel_credentials"("channel_id");

-- CreateIndex
CREATE INDEX "projects_organization_id_is_archived_idx" ON "projects"("organization_id", "is_archived");

-- CreateIndex
CREATE INDEX "projects_team_id_idx" ON "projects"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "automation_configs_project_id_key" ON "automation_configs"("project_id");

-- CreateIndex
CREATE INDEX "trend_snapshots_platform_category_captured_at_idx" ON "trend_snapshots"("platform", "category", "captured_at");

-- CreateIndex
CREATE INDEX "trend_snapshots_score_captured_at_idx" ON "trend_snapshots"("score" DESC, "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "trend_snapshots_platform_region_keyword_captured_at_key" ON "trend_snapshots"("platform", "region", "keyword", "captured_at");

-- CreateIndex
CREATE INDEX "ideas_project_id_status_score_idx" ON "ideas"("project_id", "status", "score" DESC);

-- CreateIndex
CREATE INDEX "videos_organization_id_status_created_at_idx" ON "videos"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "videos_project_id_status_idx" ON "videos"("project_id", "status");

-- CreateIndex
CREATE INDEX "videos_scheduled_at_idx" ON "videos"("scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "scripts_video_id_version_key" ON "scripts"("video_id", "version");

-- CreateIndex
CREATE INDEX "voiceovers_script_id_idx" ON "voiceovers"("script_id");

-- CreateIndex
CREATE UNIQUE INDEX "voices_provider_provider_voice_id_key" ON "voices"("provider", "provider_voice_id");

-- CreateIndex
CREATE UNIQUE INDEX "scenes_video_id_index_key" ON "scenes"("video_id", "index");

-- CreateIndex
CREATE INDEX "assets_organization_id_type_created_at_idx" ON "assets"("organization_id", "type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "assets_checksum_idx" ON "assets"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "asset_usage_video_id_asset_id_context_key" ON "asset_usage"("video_id", "asset_id", "context");

-- CreateIndex
CREATE UNIQUE INDEX "video_renditions_video_id_profile_key" ON "video_renditions"("video_id", "profile");

-- CreateIndex
CREATE UNIQUE INDEX "subtitle_tracks_video_id_language_format_key" ON "subtitle_tracks"("video_id", "language", "format");

-- CreateIndex
CREATE UNIQUE INDEX "thumbnails_video_id_variant_key" ON "thumbnails"("video_id", "variant");

-- CreateIndex
CREATE INDEX "workflows_is_template_status_idx" ON "workflows"("is_template", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflows_organization_id_slug_key" ON "workflows"("organization_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_versions_workflow_id_version_key" ON "workflow_versions"("workflow_id", "version");

-- CreateIndex
CREATE INDEX "pipeline_runs_organization_id_status_created_at_idx" ON "pipeline_runs"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pipeline_runs_video_id_status_idx" ON "pipeline_runs"("video_id", "status");

-- CreateIndex
CREATE INDEX "pipeline_step_runs_status_idx" ON "pipeline_step_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_step_runs_pipeline_run_id_node_id_key" ON "pipeline_step_runs"("pipeline_run_id", "node_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_records_bull_job_id_key" ON "job_records"("bull_job_id");

-- CreateIndex
CREATE INDEX "job_records_queue_status_idx" ON "job_records"("queue", "status");

-- CreateIndex
CREATE INDEX "job_records_created_at_idx" ON "job_records"("created_at");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_occurred_at_idx" ON "outbox_events"("published_at", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_consumer_event_id_key" ON "processed_events"("consumer", "event_id");

-- CreateIndex
CREATE INDEX "dead_letter_events_status_consumer_created_at_idx" ON "dead_letter_events"("status", "consumer", "created_at");

-- CreateIndex
CREATE INDEX "dead_letter_events_organization_id_created_at_idx" ON "dead_letter_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_scope_actor_hash_key_key" ON "idempotency_records"("scope", "actor_hash", "key");

-- CreateIndex
CREATE INDEX "publishing_tasks_status_scheduled_at_idx" ON "publishing_tasks"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "publishing_tasks_organization_id_scheduled_at_idx" ON "publishing_tasks"("organization_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "publishing_tasks_video_id_channel_id_key" ON "publishing_tasks"("video_id", "channel_id");

-- CreateIndex
CREATE INDEX "image_generations_organization_id_status_created_at_idx" ON "image_generations"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "dubbing_jobs_organization_id_status_created_at_idx" ON "dubbing_jobs"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "dubbing_jobs_video_id_idx" ON "dubbing_jobs"("video_id");

-- CreateIndex
CREATE INDEX "campaigns_organization_id_status_idx" ON "campaigns"("organization_id", "status");

-- CreateIndex
CREATE INDEX "campaigns_next_run_at_idx" ON "campaigns"("next_run_at");

-- CreateIndex
CREATE INDEX "campaign_posts_organization_id_scheduled_for_idx" ON "campaign_posts"("organization_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "campaign_posts_campaign_id_status_idx" ON "campaign_posts"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "campaign_posts_status_scheduled_for_idx" ON "campaign_posts"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "channel_analytics_daily_platform_date_idx" ON "channel_analytics_daily"("platform", "date");

-- CreateIndex
CREATE UNIQUE INDEX "channel_analytics_daily_channel_id_date_key" ON "channel_analytics_daily"("channel_id", "date");

-- CreateIndex
CREATE INDEX "video_analytics_daily_date_idx" ON "video_analytics_daily"("date");

-- CreateIndex
CREATE INDEX "video_analytics_daily_avg_percent_watched_idx" ON "video_analytics_daily"("avg_percent_watched" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "video_analytics_daily_video_id_platform_date_key" ON "video_analytics_daily"("video_id", "platform", "date");

-- CreateIndex
CREATE INDEX "optimization_reports_project_id_created_at_idx" ON "optimization_reports"("project_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "experiment_variants_experiment_id_label_key" ON "experiment_variants"("experiment_id", "label");

-- CreateIndex
CREATE INDEX "memory_entries_organization_id_scope_subject_status_confide_idx" ON "memory_entries"("organization_id", "scope", "subject", "status", "confidence" DESC);

-- CreateIndex
CREATE INDEX "memory_entries_channel_id_subject_idx" ON "memory_entries"("channel_id", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "ai_employees_organization_id_key_key" ON "ai_employees"("organization_id", "key");

-- CreateIndex
CREATE INDEX "ai_messages_organization_id_thread_id_created_at_idx" ON "ai_messages"("organization_id", "thread_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_messages_organization_id_video_id_idx" ON "ai_messages"("organization_id", "video_id");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_registry_slug_version_key" ON "plugin_registry"("slug", "version");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_installations_organization_id_plugin_id_key" ON "plugin_installations"("organization_id", "plugin_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_listings_slug_key" ON "marketplace_listings"("slug");

-- CreateIndex
CREATE INDEX "marketplace_listings_kind_status_featured_idx" ON "marketplace_listings"("kind", "status", "featured");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_purchases_listing_id_buyer_org_id_key" ON "marketplace_purchases"("listing_id", "buyer_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_reviews_listing_id_user_id_key" ON "marketplace_reviews"("listing_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "developer_apps_client_id_key" ON "developer_apps"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_authorization_codes_code_hash_key" ON "oauth_authorization_codes"("code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_grants_refresh_token_hash_key" ON "oauth_grants"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "oauth_grants_organization_id_app_id_idx" ON "oauth_grants"("organization_id", "app_id");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "feature_flag_overrides_flag_id_organization_id_plan_code_us_idx" ON "feature_flag_overrides"("flag_id", "organization_id", "plan_code", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_organization_id_status_idx" ON "api_keys"("organization_id", "status");

-- CreateIndex
CREATE INDEX "webhook_deliveries_endpoint_id_created_at_idx" ON "webhook_deliveries"("endpoint_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "webhook_deliveries_next_retry_at_idx" ON "webhook_deliveries"("next_retry_at");

-- CreateIndex
CREATE UNIQUE INDEX "processed_webhook_events_source_external_event_id_key" ON "processed_webhook_events"("source", "external_event_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "_AutomationConfigToChannel_AB_unique" ON "_AutomationConfigToChannel"("A", "B");

-- CreateIndex
CREATE INDEX "_AutomationConfigToChannel_B_index" ON "_AutomationConfigToChannel"("B");

-- AddForeignKey
ALTER TABLE "oauth_identities" ADD CONSTRAINT "oauth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_custom_role_id_fkey" FOREIGN KEY ("custom_role_id") REFERENCES "custom_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_brands" ADD CONSTRAINT "organization_brands_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_brands" ADD CONSTRAINT "organization_brands_logo_asset_id_fkey" FOREIGN KEY ("logo_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_brands" ADD CONSTRAINT "organization_brands_logo_dark_asset_id_fkey" FOREIGN KEY ("logo_dark_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_brands" ADD CONSTRAINT "organization_brands_favicon_asset_id_fkey" FOREIGN KEY ("favicon_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scim_tokens" ADD CONSTRAINT "scim_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_allowlist_entries" ADD CONSTRAINT "ip_allowlist_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_billing_profiles" ADD CONSTRAINT "organization_billing_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_credit_transactions" ADD CONSTRAINT "ai_credit_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_plugin_installation_id_fkey" FOREIGN KEY ("plugin_installation_id") REFERENCES "plugin_installations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_credentials" ADD CONSTRAINT "channel_credentials_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_default_voice_id_fkey" FOREIGN KEY ("default_voice_id") REFERENCES "voices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_configs" ADD CONSTRAINT "automation_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voiceovers" ADD CONSTRAINT "voiceovers_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voiceovers" ADD CONSTRAINT "voiceovers_voice_id_fkey" FOREIGN KEY ("voice_id") REFERENCES "voices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voiceovers" ADD CONSTRAINT "voiceovers_audio_asset_id_fkey" FOREIGN KEY ("audio_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voices" ADD CONSTRAINT "voices_preview_asset_id_fkey" FOREIGN KEY ("preview_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_usage" ADD CONSTRAINT "asset_usage_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_renditions" ADD CONSTRAINT "video_renditions_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtitle_tracks" ADD CONSTRAINT "subtitle_tracks_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thumbnails" ADD CONSTRAINT "thumbnails_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_workflow_version_id_fkey" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_step_runs" ADD CONSTRAINT "pipeline_step_runs_pipeline_run_id_fkey" FOREIGN KEY ("pipeline_run_id") REFERENCES "pipeline_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing_tasks" ADD CONSTRAINT "publishing_tasks_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing_tasks" ADD CONSTRAINT "publishing_tasks_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_generations" ADD CONSTRAINT "image_generations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dubbing_jobs" ADD CONSTRAINT "dubbing_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dubbing_jobs" ADD CONSTRAINT "dubbing_jobs_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_posts" ADD CONSTRAINT "campaign_posts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_posts" ADD CONSTRAINT "campaign_posts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_posts" ADD CONSTRAINT "campaign_posts_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_posts" ADD CONSTRAINT "campaign_posts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_analytics_daily" ADD CONSTRAINT "channel_analytics_daily_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_analytics_daily" ADD CONSTRAINT "video_analytics_daily_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_reports" ADD CONSTRAINT "optimization_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_thumbnail_id_fkey" FOREIGN KEY ("thumbnail_id") REFERENCES "thumbnails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_employees" ADD CONSTRAINT "ai_employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_installations" ADD CONSTRAINT "plugin_installations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_installations" ADD CONSTRAINT "plugin_installations_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "plugin_registry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_publisher_org_id_fkey" FOREIGN KEY ("publisher_org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_purchases" ADD CONSTRAINT "marketplace_purchases_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "marketplace_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_purchases" ADD CONSTRAINT "marketplace_purchases_buyer_org_id_fkey" FOREIGN KEY ("buyer_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_reviews" ADD CONSTRAINT "marketplace_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "developer_apps" ADD CONSTRAINT "developer_apps_owner_org_id_fkey" FOREIGN KEY ("owner_org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "developer_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "developer_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_grants" ADD CONSTRAINT "oauth_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_flag_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "feature_flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_developer_app_id_fkey" FOREIGN KEY ("developer_app_id") REFERENCES "developer_apps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AutomationConfigToChannel" ADD CONSTRAINT "_AutomationConfigToChannel_A_fkey" FOREIGN KEY ("A") REFERENCES "automation_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AutomationConfigToChannel" ADD CONSTRAINT "_AutomationConfigToChannel_B_fkey" FOREIGN KEY ("B") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
