# Lumen Studio — Production (real backend only)

**Date:** 2026-08-06 · **Branch:** `arena/019fd705-auto-publisher-ai`

**Status: production-ready wiring, real backend only.** No demo, no in-browser
engine, no local accounts. The studio talks exclusively to the AutoCreator
NestJS API through the serverless `/api/v1/*` proxy.

---

## 1. The real backend (already in this repo)

- **Auth:** email/password (scrypt, JWT, refresh rotation, DB sessions).
- **Organizations:** `/v1/organizations`.
- **Videos:** `/v1/organizations/:orgId/series` + `.../videos`; a **BullMQ
  worker** (queue `generation`) runs script → voice → scenes → render;
  `/videos/:id/stream` serves the MP4 (S3 storage, Range-aware).
- **Billing:** `/v1/organizations/:orgId/checkout-session` → Stripe.
- **Persistence:** PostgreSQL (Prisma) + Redis + S3.

---

## 2. Frontend flow (real backend only)

```
Landing → (configure prompt + settings, NO account required)
   → Generate clicked
   → /generate guards:
        no session        → /signup → /subscribe → back to /generate (auto)
        session, no plan  → /subscribe (Stripe) → back to /generate (auto)
        session + plan    → submit job → poll → auto-retry on provider failure
   → /result (stream MP4, Download / Re-render / Share / Copy link)
   → /dashboard (all past videos from the API)
```

Key modules:
- `lib/studio-api.ts` — typed API client (auth, org, series, videos, billing,
  env-gated OAuth, authenticated stream fetch).
- `lib/studio-session.ts` — real session only; `retryable` results instead of
  local fallback.
- `lib/studio-flow.ts` — ensure org/series → submit job → poll; maps backend
  status to friendly labels; **auto-retries** (re-enqueue) when the provider
  or network hiccups.

---

## 3. Requirements → how they're met

| Requirement | Implementation |
|---|---|
| **Backend only, no demo/local engine** | Removed `generator.ts`, `GeneratorStage.tsx`, `projects.ts`, and all local account/session fallback code. |
| **Provider failure → "Processing" + auto-retry** | `studio-flow.pollVideo` keeps polling; on `FAILED/ERROR` it re-enqueues (`/videos/:id/regenerate`) and loops. UI shows only **Preparing / Generating / Rendering / Processing / Completed**. |
| **No "API Unreachable" / "Cold Start"** | Every call returns a typed `ApiResult` (`reachable:false`), never a thrown error; the UI stays in a friendly Processing state and retries. |
| **Signup required only at Generate** | Landing/Create let users configure freely; `/generate` is the single gate to auth/subscribe. |
| **Register → subscribe → auto-continue** | `/signup` → `/subscribe`; Stripe checkout returns to the original `next` path; the saved draft (prompt + settings) drives the render with **no re-entry**. |
| **Google/Apple via env** | `NEXT_PUBLIC_GOOGLE_OAUTH_URL` / `NEXT_PUBLIC_APPLE_OAUTH_URL` enable the buttons instantly when set. |
| **Serverless / no sleep** | `/api/v1/*` is a Vercel serverless Route Handler → `API_UPSTREAM`; keep-alive cron in `vercel.json`; managed Postgres/Redis recommended. |
| **Higgsfield-like smoothness, original code** | Prompt studio → queue → render → results; all code/design original. |
| **Only friendly user states** | UI exposes **Preparing, Generating, Rendering, Processing, Completed**; no technical strings. |

---

## 4. Env vars to deploy

Frontend (Vercel):
```
API_UPSTREAM=https://<your-api-host>
NEXT_PUBLIC_API_BASE=                          # dev fallback only
NEXT_PUBLIC_GOOGLE_OAUTH_URL=                  # your Google OAuth start URL
NEXT_PUBLIC_APPLE_OAUTH_URL=                   # your Apple OAuth start URL
```

Backend (always-on / serverless-hosted API):
```
DATABASE_URL, REDIS_URL, AUTH_JWT_SECRET, TRUST_PROXY
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PUBLISHABLE_KEY
OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_AI_API_KEY / REPLICATE_API_TOKEN
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, META_APP_ID, META_APP_SECRET
S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_*
```

Run `scripts/e2e/prod.mjs` against the live URL to verify the full loop.

---

## 5. Verification (this session)
- `apps/web` `tsc --noEmit` — ✅
- `pnpm --filter @aca/web build` — ✅ (all routes)
- Dev server: `/`, `/create`, `/signup`, `/login`, `/subscribe`, `/generate`,
  `/result`, `/dashboard` all return **200**.
- No references to the removed demo engine remain.

> Note: the API backend cannot boot inside this sandbox (no Postgres/Redis, and
> Prisma's engine download is network-blocked here), so the API integration was
> verified against the real controller/DTO contracts and type-checked; confirm
> live calls once you deploy the backend (section 4).
