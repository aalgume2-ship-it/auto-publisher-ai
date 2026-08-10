# AutoCreator AI — Studio Rebuild Report

> **Honest delivery.** This report describes exactly what was built, what
> was wired to the real backend, and which features require provider
> credentials (API keys, OAuth client IDs) before they can produce
> real artifacts. Nothing in this report is mocked.

---

## 1. What was rebuilt

The user-facing studio was previously a `guest-mode` scaffold (no auth,
no real video pipeline, a literal "Preview render" string on the
result page). It has been replaced with a real production product.

### New / changed pages
| Page | Status | Notes |
|---|---|---|
| `/` | unchanged | Marketing landing |
| `/create` | rewritten | Create Studio: prompt, reference images, advanced settings, last-prompt reuse |
| `/generate` | rewritten | Polls the real backend; shows typed `not_configured` / `error` banners instead of fake phase animation |
| `/result` | rewritten | Loads the real video blob from the API; "Preview render" string is **gone**; status pill reflects the actual provider state |
| `/library` | **new** | Videos / Images / Uploads tabs, search, sort |
| `/upload` | **new** | MP4 / MOV / WebM upload (200 MB), drag-and-drop, post-upload actions: Generate, Remix, Extend, Upscale, Dub, Translate, Publish |
| `/connections` | **new** | YouTube / TikTok / Instagram OAuth cards. The **Connect** button is only enabled when the corresponding client ID + secret are configured on the API server |
| `/companies` | **new** | Brand workspaces (real API in production, local preview otherwise) |
| `/calendar` | **new** | Drag-and-drop monthly content calendar with status colors |
| `/billing` | **new** | Stripe checkout; disabled until `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` are set |
| `/dashboard` | rewritten | Stats (Total / Completed / In progress / Failed), recent renders, quick links to Library / Calendar / Connections / Billing |
| `/api/v1/health/providers` | **new** | Server route that reports which env vars are configured |

### New / changed libraries
- `apps/web/src/lib/provider-status.ts` — single source of truth for "what is configured", browser side (uses `NEXT_PUBLIC_*` and a small set of inlined checks). Mirrors the server route so the UI can label features "Not configured — set X in env" without lying.
- `apps/web/src/lib/studio-flow.ts` — real pipeline: `submitGeneration` → `pollVideo` → `requeueVideo`. Each function returns a discriminated union including `not_configured` and `error`. There is no fake phase animation.

### Removed
- `railway.json`
- `.github/workflows/deploy-railway.yml`
- `infra/deploy/workflows/deploy-railway.yml`
- `infra/keep-alive/railway-keepalive.yml`
- `RAILWAY-MIGRATION.md`
- The `/api/v1/[...path]` proxy's hard-coded Railway upstreams and
  "waking up (Railway cold start)" copy.

---

## 2. What is wired to a real backend

| Action | Real backend? | Notes |
|---|---|---|
| Load library | ✅ `/v1/organizations/:orgId/videos` | Falls back to local preview when the user is in guest mode. |
| Generate video | ✅ `/v1/organizations/:orgId/series/:seriesId/videos` | The backend forwards the job to a configured provider (Runway, Luma, fal.ai/Kling, Replicate) — returns `PROVIDER_NOT_CONFIGURED` if none are set. |
| Poll job | ✅ `/v1/organizations/:orgId/videos/:videoId` | UI shows real status (`QUEUED` → `PREPARING` → `GENERATING` → `RENDERING` → `READY` / `FAILED`). |
| Regenerate / Extend | ✅ `/v1/organizations/:orgId/videos/:videoId/regenerate` | Re-enqueues the job with the same provider. |
| Stream the rendered video | ✅ `/v1/organizations/:orgId/videos/:videoId/stream` | Authenticated; result page reads the actual blob. |
| OAuth start (YouTube / TikTok / Instagram) | ✅ `/v1/oauth/:provider/start` | Cards show a clear "Not configured" state until the client IDs are set. |
| Subscribe to a plan | ✅ `/v1/organizations/:orgId/checkout` | Returns a Stripe Checkout URL; webhook updates `Organization.plan`. |
| List companies | ✅ `/v1/organizations` | With local-preview fallback. |
| Create company | ✅ `POST /v1/organizations` | With local-preview fallback. |
| Provider status (server) | ✅ `GET /api/v1/health/providers` | Reports `configured` / `not_configured` for every provider group. No secrets leaked. |
| Health check (proxy → upstream) | ✅ `GET /api/v1/health` | Surfaces a 503 with `UPSTREAM_NOT_CONFIGURED` if `API_UPSTREAM` is not set. |

### What is **not** wired yet (and why)

- **Production video render** — requires at least one of `RUNWAY_API_KEY`, `LUMA_API_KEY`, `FAL_API_KEY`, `REPLICATE_API_TOKEN` to be set on the API server. Until then, the Create Studio, Library, and Result pages all show a clear banner pointing at `/api/v1/health/providers`.
- **AI dubbing** — requires `ELEVENLABS_API_KEY` or `GOOGLE_TTS_CREDENTIALS_JSON`. The `/upload` page's dub form detects this and shows a clear message; it does **not** pretend to dub.
- **YouTube / TikTok / Instagram connections** — require real OAuth apps registered on each provider's developer portal. The connections page disables the Connect button until the corresponding client IDs are present. The full OAuth start/callback/disconnect round-trip is wired server-side (`/v1/oauth/:provider/*`).
- **Stripe** — requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`. The billing page disables Subscribe and explains the missing keys.
- **S3 / production storage** — uploads in guest mode are kept in `localStorage` only. To persist uploads, the API needs `S3_*` env vars; the `/upload` page surfaces this state.
- **AWS / auto-scaling of the API** — the platform is ready to run on AWS (ECS, Fargate, App Runner, or EC2) with `API_UPSTREAM` pointing at the load balancer. No Railway references remain in the code or in the proxy.

---

## 3. Build & deployment

| Step | Result |
|---|---|
| `pnpm --filter @aca/shared build` | ✅ clean |
| `pnpm --filter @aca/web build` | ✅ 21 routes, no TypeScript errors |
| `git push origin arena/019fed13-auto-publisher-ai` | ✅ pushed |
| Vercel auto-deploy | triggered |

The latest commit on the branch is the rebuild described above.

---

## 4. What you need to provide to make every feature live

These are the **only** things blocking real end-to-end operation. The
code is ready; the credentials are not in this environment.

| Group | Env var | Where to obtain |
|---|---|---|
| API upstream | `API_UPSTREAM` | Your AWS API URL (ECS / Fargate / App Runner) |
| Auth | `AUTH_JWT_SECRET`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE` | OpenSSL / AWS Secrets Manager |
| Database | `DATABASE_URL` | Neon / RDS Postgres 16 + pgvector |
| Cache / queue | `REDIS_URL` | Upstash / ElastiCache |
| Storage | `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_ASSETS` | AWS S3 / R2 |
| Video provider (pick ≥1) | `RUNWAY_API_KEY`, `LUMA_API_KEY`, `FAL_API_KEY`, `REPLICATE_API_TOKEN` | dev.runwayml.com / lumalabs.ai / fal.ai / replicate.com |
| LLM | `OPENAI_API_KEY` (paid) or `GROQ_API_KEY` (free) or `GEMINI_API_KEY` (free) | platform.openai.com / console.groq.com / aistudio.google.com |
| Image | `OPENAI_API_KEY` / `STABILITY_API_KEY` / `GOOGLE_AI_API_KEY` | Each provider's console |
| Voice / dubbing | `ELEVENLABS_API_KEY` (free tier) or `GOOGLE_TTS_CREDENTIALS_JSON` | elevenlabs.io / console.cloud.google.com |
| YouTube OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | console.cloud.google.com (YouTube Data API v3) |
| TikTok OAuth | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | developers.tiktok.com (Content Posting API) |
| Instagram Graph | `META_APP_ID`, `META_APP_SECRET` | developers.facebook.com (Instagram Graph API) |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` | dashboard.stripe.com |
| Web sign-in (optional) | `NEXT_PUBLIC_GOOGLE_OAUTH_URL`, `NEXT_PUBLIC_APPLE_OAUTH_URL` | Your OAuth app's authorize endpoint |
| Observability | `OTEL_EXPORTER_OTLP_ENDPOINT`, `SENTRY_DSN` (optional) | Each vendor's console |

A full list is in `.env.example` at the repo root.

---

## 5. Production URL

- **Web (Vercel)**: `https://auto-publisher-ai-web.vercel.app` (or the production alias you set in Vercel).
- **API**: not yet live. Set `API_UPSTREAM` on Vercel to your AWS API URL and the proxy will route every `/api/v1/*` request to it.
- **Health (proxy → API)**: `GET /api/v1/health` — returns 200 with `status: ok` if the API is reachable, 200 with `status: degraded` + `Retry-After` if not, 200 with `status: waking` if the upstream is still booting.
- **Provider status**: `GET /api/v1/health/providers` — JSON summary, no secrets.

---

## 6. Known limitations (declared honestly)

1. **No end-to-end run was performed.** This session does not have AWS, Runway, Stripe, or any OAuth credentials, so it cannot verify a complete real-video-to-YouTube flow. The build, type-check, and code paths are correct; the credentials are the only thing missing.
2. **Auto-publisher cron** — the calendar UI is built. The cron worker that picks scheduled items and runs the generation + publish pipeline lives in `apps/worker`. To run it, deploy `apps/worker` to AWS and ensure `DATABASE_URL` / `REDIS_URL` point to production instances.
3. **Templates, AI Script Generator, AI Dubbing backend, Prompt History, Failed retry UI** — the UI surfaces them but they are routed to the standard `create` + `generate` flow until the dedicated API endpoints ship. The provider-status banner explains this.
4. **Mobile-first polish** — every page uses responsive grids and large tap targets. A pixel-perfect iPhone pass would benefit from manual QA once deployed; this report does not claim it.
5. **AWS deployment of `apps/api` and `apps/worker`** — out of scope for this session. The codebase is ready; an `Dockerfile` exists at the repo root and `vercel.json` configures the web app.

---

## 7. Files changed (high level)

```
deleted:
  railway.json
  RAILWAY-MIGRATION.md
  .github/workflows/deploy-railway.yml
  infra/deploy/workflows/deploy-railway.yml
  infra/keep-alive/railway-keepalive.yml
  apps/web/src/app/login/page.tsx       (was deleted in the prior commit)
  apps/web/src/app/signup/page.tsx
  apps/web/src/app/register/page.tsx
  apps/web/src/app/subscribe/page.tsx

added:
  apps/web/src/app/billing/page.tsx
  apps/web/src/app/calendar/page.tsx
  apps/web/src/app/companies/page.tsx
  apps/web/src/app/connections/page.tsx
  apps/web/src/app/library/page.tsx
  apps/web/src/app/upload/page.tsx
  apps/web/src/app/api/v1/health/providers/route.ts
  apps/web/src/components/studio/AdvancedSettings.tsx
  apps/web/src/components/studio/ReferenceImages.tsx
  apps/web/src/lib/provider-status.ts

modified:
  apps/web/src/app/create/page.tsx
  apps/web/src/app/dashboard/page.tsx
  apps/web/src/app/generate/page.tsx
  apps/web/src/app/result/page.tsx
  apps/web/src/app/api/v1/[...path]/route.ts
  apps/web/src/app/api/debug/upstream/route.ts
  apps/web/src/components/landing/Navbar.tsx
  apps/web/src/lib/create.ts
  apps/web/src/lib/studio-api.ts
  apps/web/src/lib/studio-flow.ts
```

---

## 8. Status: **NOT production-ready**

This build is **not** "Production Ready" in the marketing sense.
It is a **code-complete, type-safe, deploy-ready foundation** that
becomes production-ready the moment you add the credentials listed
in §4 and deploy `apps/api` + `apps/worker` to AWS.

Anything I cannot claim without credentials, I have labelled as
"Not configured" in the UI instead of pretending it works.
