# Cold Start & Registration UX — Change Report

**Date:** 2026-08-06
**Branch:** `arena/019fd705-auto-publisher-ai`
**Scope:** API cold-start elimination · simplified registration · UX polish

---

## 1. Root cause of "API Cold Start / Unreachable"

The web app (Vercel) talks to its own Next.js proxy at `/api/v1/*`, which
forwards every request to the backend API. That backend was running on a
**Render free plan** instance (`autocreator-api-preview.onrender.com`,
`plan: free` in `render.yaml`).

Render's free tier **sleeps a web service after ~15 minutes of no traffic** and
"wakes" it on the next request. That wake-up is the cold start: the first
request after an idle period waits many seconds (and can time out), and the
dashboard's status chip surfaced it as **"API Cold Start / Unreachable"**.

Two hard-coded references to that sleeping instance existed in the web app:

- `apps/web/src/app/api/v1/[...path]/route.ts` — proxy upstream fallback
- `apps/web/src/lib/api.ts` — `API_BASE` fallback (asset URLs)

The backend **itself is fine** — it is not "unreachable" as a product fault;
the free host was simply sleeping. The label was misleading end-users into
thinking the product was broken.

---

## 2. What was changed — cold start

### 2.1 Keep the API warm (deploy-side)
`vercel.json` now declares a **Vercel Cron** that pings the proxy every 10 minutes:

```json
"crons": [
  { "path": "/api/v1/health", "schedule": "*/10 * * * *" }
]
```

`/api/v1/health` → proxy → upstream `/health` (public, no auth). Because the
ping arrives every 10 minutes — well under Render's 15-minute idle threshold —
the instance **never idles into sleep**, so a real user's first request is
served immediately instead of triggering a cold start.

### 2.2 Honest, non-scary UI
`apps/web/src/components/HealthChip.tsx`:
- Removed the **"API Cold Start / Unreachable"** label.
- Shows clear Arabic: **الخدمة متاحة / الخدمة غير متاحة / جارٍ التحقق…**.
- Now **auto-rechecks every 30 s**, so a transient network blip self-heals
  without a page reload (no persistent scary status).

`apps/web/src/lib/api.ts`:
- Removed the message that blamed "النسخة المجانية في طور الإيقاظ" (free
  version waking up) — replaced with a neutral, accurate
  "تعذّر الوصول إلى الخادم — تحقق من اتصالك وأعد المحاولة".

### 2.3 Env review (`API_URL` / upstream)
The proxy reads the upstream from **`API_UPSTREAM`** (server-only env var) →
`NEXT_PUBLIC_API_BASE` → dev fallback. The browser never sees the upstream
URL; all traffic goes through the same-origin `/api/v1/*` proxy. Production
must set `API_UPSTREAM` to the real, always-on API origin.

### 2.4 Honest guardrail note (important)
The cron keeps the **current** instance warm, which removes the perceived
cold start. The **definitive** guarantee is to run the API on an **always-on
host** (Render `plan: standard` or higher, or the K8s topology in
`docs/Deployment.md`). `render.yaml` now documents this requirement clearly.
Vercel cron cadence below daily requires a **Pro/Production** Vercel plan;
on the free (Hobby) plan crons fire once daily and are **not** a sufficient
keep-alive — in that case use an external uptime pinger (e.g. a free
UptimeRobot/Uptime-Kuma check every 5 min) or an always-on host.

---

## 3. Simplified registration (like global platforms)

### Backend — auto-provision workspace on sign-up
`apps/api/src/modules/auth/auth.controller.ts` — `register` now, immediately
after creating the account + session, **auto-provisions the user's first
workspace** (an `Organization` with `OWNER` membership) with sensible defaults
(timezone/locale from the request, default security policy). It returns the new
workspace in the response (`workspace: { id, name, slug }`). Provisioning is
**best-effort by design** — a hiccup never fails registration (the dashboard
still offers manual creation).

- `apps/api/src/modules/auth/auth.module.ts` — imports `OrganizationsModule`
  so the controller can use `OrganizationsService`.

### Frontend — three fields, one button
`apps/web/src/app/register/page.tsx`:
- Only **الاسم / البريد الإلكتروني / كلمة المرور** + one button **إنشاء حساب**.
- Removed "Join the studio", "Create Studio Access", "Workspace-ready",
  "AI studio flow", etc.
- On success it persists the auto-provisioned `orgId` and redirects straight
  to the dashboard — the user lands in a **ready workspace**, no empty state.

`apps/web/src/app/login/page.tsx`: simplified copy to clear Arabic
("تسجيل الدخول"), removed "Enter Studio" / "operator cockpit" jargon.

The register endpoint is **additive** — existing clients still get
`user` + `tokens`; the new `workspace` field is optional. The live E2E script
(`scripts/e2e/prod.mjs`) remains compatible (it asserts status 201, user id,
and tokens, and explicitly-created workspaces still appear in the list).

---

## 4. What was NOT broken

- `pnpm --filter @aca/shared build` — ✅ passed
- `apps/web` `tsc --noEmit` — ✅ passed
- `pnpm --filter @aca/web build` (Next.js production build, all 15 routes) — ✅ passed
- Register response is backward-compatible (additive `workspace` field)
- No existing routes/contracts changed

> Note: the API package itself could not be fully type-checked in this
> sandbox because Prisma's engine download (`binaries.prisma.sh`) and the
> `ffmpeg-static` binary are blocked by the sandbox's outbound network rules.
> The API changes were verified by manual type review against the real
> `OrganizationsService` / `@aca/auth` / `@aca/shared` signatures.

---

## 5. How we verify the cold start is gone

1. **Keep-alive active:** the Vercel Cron hits `/api/v1/health` every 10 min →
   upstream never idle → first user request is warm (sub-second).
2. **HealthChip auto-recheck** every 30 s → no persistent "unreachable" state;
   transient blips recover automatically.
3. **Recommended prod gate:** run `scripts/e2e/prod.mjs` against the live URL
   twice, separated by > 15 min of no traffic, and confirm the **first** health
   check answers immediately (no multi-second cold start). Then confirm
   register → login → dashboard lands in a ready workspace in a few seconds.
4. For a hard 99.9% guarantee, move the API to an always-on plan (see §2.4).
