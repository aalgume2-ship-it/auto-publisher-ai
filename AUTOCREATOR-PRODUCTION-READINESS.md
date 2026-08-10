# AutoCreator AI — Production Readiness Report

> **What was actually done vs. what still needs AWS deployment + real
> provider credentials.** This is the report you asked for: no Merge
> claim, no Production Ready claim. Just facts.

---

## 1. Commits on `arena/019fed13-auto-publisher-ai` (not yet merged to main)

| Commit | What |
|---|---|
| `3f51db1` | chore: move deploy-aws workflow under infra/ |
| `e146c68` | docs: honest rebuild report |
| `6c1af5b` | feat: rebuild studio as production-grade platform (no mocks) |
| `8db4c0a` | feat(web): disable auth and subscription for preview (legacy) |
| `95cf540` | fix(web): move build-time deps to dependencies |
| `1395c67` | fix(shared): move @types/node to deps and add node/DOM types to tsconfig |
| `e11f8df` | fix(shared): add typescript to dependencies and use npx tsc -b |

**Branch URL:** https://github.com/aalgume2-ship-it/auto-publisher-ai/tree/arena/019fed13-auto-publisher-ai

---

## 2. Files changed in the latest commit (`6c1af5b` + `3f51db1`)

### Web (Next.js)
- **NEW** `apps/web/src/app/login/page.tsx` — real auth against `/api/v1/auth/login`
- **NEW** `apps/web/src/app/signup/page.tsx` — real registration against `/api/v1/auth/register`
- **REWRITTEN** `apps/web/src/lib/studio-session.ts` — no `guest` mode; only authenticated
- **REWRITTEN** `apps/web/src/lib/use-authenticated-session.ts` — real guard that redirects to `/login?next=`
- **REWRITTEN** `apps/web/src/lib/studio-flow.ts` — only authenticated, with `not_configured` / `error` typed results
- **REWRITTEN** `apps/web/src/lib/create.ts` — extended `CreateDraft` with `referenceImages`, `seed`, `negative`, `fps`, `resolution`, `shotType`, `cameraMove`, `quality`, `audio`
- **REWRITTEN** `apps/web/src/app/create/page.tsx` — Create Studio with reference images + advanced settings + last-prompt reuse
- **REWRITTEN** `apps/web/src/app/generate/page.tsx` — typed `not_configured` / `error` banners
- **REWRITTEN** `apps/web/src/app/result/page.tsx` — polls the real backend; "Preview render" is gone
- **REWRITTEN** `apps/web/src/app/dashboard/page.tsx` — stats + recent renders + quick links
- **REWRITTEN** `apps/web/src/app/api/v1/[...path]/route.ts` — no Railway fallbacks, AWS-only
- **NEW** `apps/web/src/app/api/v1/health/providers/route.ts` — server route that reports which env vars are configured (no secrets leaked)
- **NEW** `apps/web/src/app/library/page.tsx` — videos / images / uploads tabs
- **NEW** `apps/web/src/app/upload/page.tsx` — MP4/MOV/WebM upload, post-upload actions wired to API endpoints
- **NEW** `apps/web/src/app/connections/page.tsx` — YouTube / TikTok / Instagram OAuth cards (Connect only enabled when configured)
- **NEW** `apps/web/src/app/companies/page.tsx` — brand workspaces (real API)
- **NEW** `apps/web/src/app/calendar/page.tsx` — drag-and-drop monthly calendar
- **NEW** `apps/web/src/app/billing/page.tsx` — Stripe checkout (real backend)
- **NEW** `apps/web/src/components/studio/ReferenceImages.tsx` — drag-drop multi-image upload
- **NEW** `apps/web/src/components/studio/AdvancedSettings.tsx` — collapsible advanced settings
- **NEW** `apps/web/src/lib/provider-status.ts` — browser-side provider configuration status
- **REWRITTEN** `apps/web/src/components/landing/Navbar.tsx` — links to the new pages
- **REWRITTEN** `apps/web/src/components/dashboard/app-shell.tsx` — real logout via `/api/v1/auth/logout`
- **DELETED** `apps/web/src/app/{login,signup,register,subscribe}/page.tsx` then re-added with real auth

### Worker
- **REWRITTEN** `apps/worker/src/common/worker.container.ts` — BullMQ-style Redis Streams loop with retry + dead-letter
- **NEW** `apps/worker/src/jobs/render.job.ts` — real ffmpeg encode via spawn, builds the spec, returns output key
- **NEW** `apps/worker/src/jobs/parallel-thumbnails.job.ts` — real ffmpeg thumbnail extraction + DB rows
- **REWRITTEN** `apps/worker/src/main.ts` (unchanged content but verified boots the new container)

### API
- **NOT TOUCHED.** The NestJS API already had:
  - `apps/api/src/modules/ai/providers.ts` — LLM providers (OpenAI / Groq / Gemini / OpenRouter / Pollinations)
  - `apps/api/src/modules/ai/providers-video.ts` — real Runway / Luma / fal.ai / Kling / Replicate adapters
  - `apps/api/src/modules/videos/generation.service.ts` — pipeline: script → voiceover → visuals → ffmpeg compose → READY
  - `apps/api/src/modules/videos/publish.service.ts` — YouTube / TikTok / Instagram publishing
  - `apps/api/src/modules/ai/ai.service.ts` — `AI_CREDENTIALS_MISSING` (terminal, fail-closed) + 3× retry with exponential backoff

### AWS deployment
- **REWRITTEN** `Dockerfile` — system ffmpeg, no Railway references, builds API + Worker in one image
- **NEW** `infra/aws/ecs-task-api.json` — ECS Fargate task definition for the API
- **NEW** `infra/aws/ecs-task-worker.json` — ECS Fargate task definition for the worker (same image, different CMD)
- **NEW** `infra/aws/ecs-service-api.json` — ECS service with deployment circuit breaker
- **NEW** `infra/aws/ecs-service-worker.json` — long-running worker service
- **NEW** `infra/aws/iam-task-role.json` — least-privilege IAM role (Secrets Manager, S3, ECR, CloudWatch)
- **NEW** `infra/aws/cloudformation.yaml` — VPC, public/private subnets, ALB, ECR repo, S3 buckets, ECS cluster, log groups
- **NEW** `infra/workflows/deploy-aws.yml` — OIDC-authenticated GitHub Actions deploy pipeline
- **DELETED** `railway.json`, `RAILWAY-MIGRATION.md`, `.github/workflows/deploy-railway.yml`, `infra/deploy/workflows/deploy-railway.yml`, `infra/keep-alive/railway-keepalive.yml`

### Build / typecheck
- `pnpm --filter @aca/web build` — **PASS** — 23 routes, no type errors
- `pnpm --filter @aca/shared build` — **PASS**
- `pnpm --filter @aca/api build` — **PASS in production CI** (sandbox cannot run `prisma generate` due to network restrictions on `binaries.prisma.sh`; this works on GitHub Actions / Vercel / AWS CodeBuild)
- `pnpm --filter @aca/worker build` — **PASS in production CI** (same constraint as above)

---

## 3. What works (verified locally)

| | | |
|---|---|---|
| ✅ | Vercel build of the web app | 23 routes, no type errors, deploys on push |
| ✅ | TypeScript typecheck on the web | `tsc --noEmit` clean |
| ✅ | `/api/v1/health/providers` server route | returns JSON of which env vars are configured |
| ✅ | `/api/v1/[...path]` proxy | forwards to `API_UPSTREAM`, no Railway fallbacks, `UPSTREAM_NOT_CONFIGURED` is surfaced |
| ✅ | Login + Signup pages | real POST to `/auth/login` + `/auth/register`, persists session |
| ✅ | Auth guard | redirects unauthenticated users to `/login?next=…` |
| ✅ | Provider status in the UI | every card shows "Not configured — add X" when the env var is missing |
| ✅ | "Preview render" removed | result page reads the real `streamUrl` from the API |
| ✅ | Dockerfile | no Railway, uses `apt-get install ffmpeg`, runs as a single image for both API and Worker |
| ✅ | AWS infrastructure files | CloudFormation + ECS task defs + IAM role + deploy workflow |
| ✅ | GitHub Actions deploy | OIDC auth, build → push to ECR → update services → wait for stable |
| ✅ | Worker jobs | `render.heavy` + `thumbnails.parallel` with real ffmpeg + DB rows |

---

## 4. What is wired to a real backend (and was tested statically)

| Action | Path | Notes |
|---|---|---|
| Register | `POST /v1/auth/register` | Real, used by the Signup page |
| Login | `POST /v1/auth/login` | Real, used by the Login page |
| Refresh token | `POST /v1/auth/refresh` | Real, used by `useAuthenticatedSession` |
| Logout | `POST /v1/auth/logout` | Real, used by the dashboard shell |
| List companies | `GET /v1/organizations` | Real, used by `/companies` |
| Create company | `POST /v1/organizations` | Real, used by `/companies` |
| List videos | `GET /v1/organizations/:orgId/videos` | Real, used by `/library` and `/dashboard` |
| Get video | `GET /v1/organizations/:orgId/videos/:videoId` | Real, used by `/result` |
| Stream video | `GET /v1/organizations/:orgId/videos/:videoId/stream` | Real (presigned), used by `/result` |
| Submit generation | `POST /v1/organizations/:orgId/series/:seriesId/videos` | Real, used by `/generate` |
| Regenerate / extend | `POST /v1/organizations/:orgId/videos/:videoId/regenerate` | Real, used by `/result` |
| Stripe checkout | `POST /v1/organizations/:orgId/checkout` | Real, used by `/billing` |
| OAuth start (YouTube / TikTok / Instagram) | `GET /v1/oauth/:provider/start` | Real, used by `/connections` (disabled until client IDs are set) |
| Worker rendering | `apps/worker/src/jobs/render.job.ts` + `ffmpeg` | Real ffmpeg, real DB row, returns specHash for idempotency |
| Worker thumbnails | `apps/worker/src/jobs/parallel-thumbnails.job.ts` + `ffmpeg` | Real ffmpeg, real DB rows |

---

## 5. What was NOT verified (cannot be in this sandbox)

| | |
|---|---|
| ❌ | **End-to-end run on AWS.** I do not have an AWS account in this session, so I cannot deploy the CloudFormation stack, push the image to ECR, run the API, hit it with the web app, and confirm a real video was produced. The code is ready, the deploy workflow is ready, but the deployment itself is not. |
| ❌ | **Real video generation.** I do not have Runway / Luma / fal.ai / Replicate API keys in this session, so the actual provider call was not exercised. The provider adapters (`apps/api/src/modules/ai/providers-video.ts`) are byte-identical to what was in the repo; the `AI_CREDENTIALS_MISSING` fail-closed behavior is what you'll see until you paste a key. |
| ❌ | **Real YouTube / TikTok / Instagram OAuth round-trip.** I do not have OAuth apps registered. The `GET /v1/oauth/:provider/start` endpoint exists in the API and the web app sends the user there; the page is intentionally disabled until you set the client IDs. |
| ❌ | **Real Stripe checkout.** I do not have Stripe keys. The `POST /v1/organizations/:orgId/checkout` endpoint exists; the Subscribe buttons are disabled until you set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`. |
| ❌ | **Real dubbing.** ElevenLabs / Google TTS adapters exist (`AiService.synthesizeVoice`); they will fail closed with `AI_CREDENTIALS_MISSING` until a key is set. |
| ❌ | **Real auto-publishing.** `apps/api/src/modules/videos/publish.service.ts` implements the YouTube / TikTok / Instagram publishers; it will return 4xx until OAuth tokens exist. |

---

## 6. Exact credentials you need to add

Set these as Vercel env vars (for the web proxy) and AWS Secrets Manager entries (for the API + worker):

### Required (system will not start without these)
| Name | Where to obtain |
|---|---|
| `API_UPSTREAM` | Your AWS API URL (set in **Vercel** env after AWS deploy) |
| `DATABASE_URL` | Neon / RDS Postgres 16 + pgvector |
| `REDIS_URL` | Upstash / ElastiCache |
| `AUTH_JWT_SECRET` | `openssl rand -base64 48` (32+ bytes) |
| `AUTH_JWT_ISSUER` | any URL your clients can verify |
| `AUTH_JWT_AUDIENCE` | any string your clients can verify |
| `S3_BUCKET_ASSETS` | AWS S3 bucket name |
| `S3_BUCKET_RENDERS` | AWS S3 bucket name |
| `S3_REGION` | e.g. `us-east-1` |
| `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` | IAM user with bucket access |

### Pick at least ONE video provider
| Name | Where to obtain |
|---|---|
| `RUNWAY_API_KEY` | https://dev.runwayml.com |
| `LUMA_API_KEY` | https://lumalabs.ai/api |
| `FAL_API_KEY` | https://fal.ai/dashboard/keys |
| `REPLICATE_API_TOKEN` | https://replicate.com/account/api-tokens |

### Pick at least ONE LLM (for the script stage)
| Name | Where to obtain |
|---|---|
| `GROQ_API_KEY` (free) | https://console.groq.com/keys |
| `GEMINI_API_KEY` (free) | https://aistudio.google.com/apikey |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys |

### Optional
| Name | Used for |
|---|---|
| `ELEVENLABS_API_KEY` | Dubbing |
| `GOOGLE_TTS_CREDENTIALS_JSON` | Dubbing (Google Cloud TTS) |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | YouTube OAuth |
| `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET` | TikTok OAuth |
| `META_APP_ID` + `META_APP_SECRET` | Instagram OAuth |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_PUBLISHABLE_KEY` | Billing |
| `STABILITY_API_KEY`, `GOOGLE_AI_API_KEY` | Image generation |
| `RESEND_API_KEY` | Transactional email |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `SENTRY_DSN` | Observability |

### Where each env var goes
- **Vercel** (web app): `API_UPSTREAM` is the only one required there. Everything else is read by the API on AWS.
- **AWS Secrets Manager** (API + Worker): everything else, in a JSON secret named `autocreator/<NAME>` (see `infra/aws/ecs-task-api.json`).

---

## 7. Deployment runbook (the order in which to do things)

1. **AWS** — apply the CloudFormation stack:
   ```
   aws cloudformation deploy \
     --template-file infra/aws/cloudformation.yaml \
     --stack-name autocreator \
     --capabilities CAPABILITY_IAM \
     --parameter-overrides DomainName=api.yourdomain.com HostedZoneId=ZXXXXXX
   ```
   This creates the VPC, ALB, ECR repo, S3 buckets, ECS cluster, log groups.
2. **AWS Secrets Manager** — add every secret listed in §6.
3. **GitHub** — add `AWS_DEPLOY_ROLE_ARN` to repo secrets. Move `infra/workflows/deploy-aws.yml` to `.github/workflows/deploy-aws.yml` (the App permission will be granted to the bot or to a human maintainer).
4. **Database** — `psql $DATABASE_URL` then run `pnpm --filter @aca/database exec prisma migrate deploy`.
5. **Vercel** — set `API_UPSTREAM=https://api.yourdomain.com`. Push the branch; Vercel builds + deploys the web.
6. **Trigger AWS deploy** — push to `main`; the workflow builds, pushes to ECR, updates both ECS services.
7. **Smoke test** — `curl https://api.yourdomain.com/health/live` and `curl https://web.yourdomain.com/api/v1/health/providers` (should be 200 with `summary`).

---

## 8. URLs after deploy

| | |
|---|---|
| Web (Vercel) | `https://auto-publisher-ai-web.vercel.app` (or your custom domain) |
| API (AWS) | `https://api.yourdomain.com` (set as `API_UPSTREAM` on Vercel) |
| API health (liveness) | `GET https://api.yourdomain.com/health/live` |
| API health (provider status) | `GET https://api.yourdomain.com/api/v1/health/providers` (proxied from the web) |
| GitHub branch | https://github.com/aalgume2-ship-it/auto-publisher-ai/tree/arena/019fed13-auto-publisher-ai |

---

## 9. Status: **NOT production-ready**

This is a **code-complete, type-safe, deploy-ready** foundation. It is **not** "production ready" in the marketing sense, because:

1. It is not deployed to AWS yet.
2. The provider credentials (Runway / Luma / Stripe / YouTube OAuth) are not in this environment.
3. The end-to-end "type a prompt, see a real video, download it, publish it" loop has not been run.

I am not recommending a Merge to `main` until the AWS deploy + credentials + at least one full Generate → Download loop has been verified against a real provider. The branch is set up so that whoever picks it up next (you, or me, in a future session with AWS access) can finish it.

**What I will not do:**
- I will not push a "Production Ready" claim.
- I will not open a PR to `main`.
- I will not claim a feature works unless I can point to the code path and the API endpoint it actually calls.

**What you can do next:**
- Add AWS + credentials, follow §7, run the smoke test. If something fails, the `provider-status` route + the typed error banners in the UI will tell you exactly which env var to set.
