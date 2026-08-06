# Production Verification Report

**Date:** 2026-08-06 · **Branch:** `arena/019fd705-auto-publisher-ai`

> **Honest bottom line:** This session **cannot complete** a live production
> verification, because the sandbox blocks the exact infrastructure and
> credentials that a real deploy requires. Per your instruction ("don't declare
> complete until proven"), I am **NOT** declaring the product Production-Ready.
> Below is: (1) what was verified with real evidence, (2) the hard blockers
> with proof, (3) the exact runbook + CI artifacts that will produce the proof
> the moment they run in a real environment, and (4) an honest Pass/Blocked
> matrix. I have not fabricated any passing result.

---

## 1. What this sandbox proved (real evidence)

These are actual, repeatable checks run in this environment:

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `apps/web` TypeScript compile | ✅ PASS | `tsc --noEmit` → exit 0 |
| 2 | `@aca/shared` build | ✅ PASS | `pnpm --filter @aca/shared build` → exit 0 |
| 3 | Next.js production build (all routes) | ✅ PASS | `pnpm --filter @aca/web build` → 20 routes, exit 0 |
| 4 | App routes serve HTTP 200 | ✅ PASS | `/`, `/create`, `/signup`, `/login`, `/subscribe`, `/generate`, `/result`, `/dashboard` → 200 |
| 5 | Demo/local engine removed | ✅ PASS | `generator.ts`, `GeneratorStage.tsx`, `projects.ts`, all local account/session fallbacks deleted; no references remain |
| 6 | Friendly states only | ✅ PASS | UI maps backend status → Preparing / Generating / Rendering / Processing / Completed; no "Unreachable"/"Cold Start" strings |
| 7 | E2E suite covers full loop incl. worker + download | ✅ PASS (syntax/ready) | `node --check scripts/e2e/prod.mjs` → OK; suite now polls to READY, checks rendition storage, stream bytes, dashboard library, Stripe (gated), OAuth (gated) |

---

## 2. Hard blockers in THIS environment (with proof)

These cannot be worked around from the sandbox. They are infrastructure /
credential, not code.

### B1 — Cannot run the real API backend (Prisma engine download blocked)
- The API (NestJS + Prisma + BullMQ) needs `libquery_engine-*.so.node`,
  downloaded by `prisma generate` from `binaries.prisma.sh`.
- Probe: `curl https://binaries.prisma.sh/ → 000` (connection blocked). The
  GitHub release-asset CDNs that mirror it are also blocked
  (`objects.githubusercontent.com → 000`, `release-assets.githubusercontent.com → 000`).
- `find / -name "libquery_engine*.node"` → none anywhere.
- Consequence: `prisma generate` fails, so the API cannot boot here. Without
  the API booted there is **no Postgres/Redis/Worker/Stripe/S3 to test**.

### B2 — No local Postgres / Redis / Worker possible
- `docker` not installed. `psql` / `redis-server` not installed.
- `apt-get update` cannot fetch Debian indexes (deb.debian.org connection
  failed over both HTTP and HTTPS) → cannot install postgresql / redis-server.

### B3 — Cannot run Lighthouse (no browser)
- No Chrome/Chromium on the system; all browser download CDNs are blocked
  (`storage.googleapis.com`, `playwright.azureedge.net`, etc. → 000) and apt
  (for browser shared libs) is blocked. Lighthouse cannot execute without a
  browser.

### B4 — No deployment credentials
- No Vercel CLI / VERCEL_TOKEN in the environment (checked `env`, `~/.config`).
  Cannot push to a live `vercel.app` production URL from here. So there is no
  real production URL to verify or report.

### B5 — No third-party credentials
- No Stripe test keys, no Google/Apple OAuth client IDs, no AI-provider keys
  (Runway/Luma/Replicate/OpenAI), no S3 keys. These are required for the
  generation worker, Stripe checkout, and social sign-in to function in a real
  deploy. They must be supplied by the account owner at deploy time.

---

## 3. Honest status matrix (per your checklist)

| # | Requirement | Status | Note |
|---|---|---|---|
| 1 | Deploy to production | **BLOCKED** | Needs Vercel credentials (B4) |
| 2 | Set all env vars | **BLOCKED** | Needs the owner's keys (B4/B5) |
| 3 | Run DB + Redis + Worker | **BLOCKED** | No Docker/apt/Prisma engines in sandbox (B1/B2) |
| 4 | Create account (live) | **BLOCKED** | Requires deployed API (B1) |
| 5 | Sign in (live) | **BLOCKED** | Requires deployed API (B1) |
| 6 | Create project | **BLOCKED** | Requires deployed API (B1) |
| 7 | Submit job | **BLOCKED** | Requires deployed API (B1) |
| 8 | Worker executes | **BLOCKED** | Requires deployed API + AI key (B1/B5) |
| 9 | Video created | **BLOCKED** | Requires deployed API + AI key (B1/B5) |
| 10 | Video in Storage | **BLOCKED** | Requires deployed API + S3 (B1/B5) |
| 11 | Appears in Dashboard | **BLOCKED** | Requires deployed API (B1) |
| 12 | Download video | **BLOCKED** | Requires deployed API + S3 (B1/B5) |
| 13 | Stripe (sandbox) | **BLOCKED** | Needs Stripe test keys (B5) |
| 14 | Google/Apple sign-in | **BLOCKED** | Needs OAuth client IDs (B5) |
| 15 | Lighthouse audit | **BLOCKED** | No browser installable (B3) |
| 16 | Fix issues found | — | Nothing to fix yet; no runtime ran |
| 17 | Final live URL | **BLOCKED** | No deployment possible (B4) |
| 18 | Confirm "Production Ready" | **NOT CLAIMED** | Cannot be proven here |

**Verifiable "code-ready" items that DO pass:** frontend typecheck, production
build, all routes serve 200, demo engine fully removed, friendly-only user
states, and an E2E suite that covers the complete loop (ready to run in real CI).

---

## 4. Artifacts added so the verification becomes executable

These let a real CI pipeline (with credentials + a browser) produce the missing
evidence automatically:

1. **Enhanced live E2E** — `scripts/e2e/prod.mjs`
   Now verifies the full loop end-to-end: health → register → login → workspace
   → series → **submit job → poll to READY (worker execution) → rendition in
   storage → download stream bytes → appears in dashboard library** → refresh →
   logout → re-login → persistence. Also has **credential-gated** Stripe
   checkout and Google/Apple OAuth checks (they run only when keys are present,
   so they never cause false failures).

2. **Lighthouse CI** — `.github/workflows/production-verification.yml`
   - `lighthouse` job: builds the app, serves it, runs a real Lighthouse audit
     with a headless Chrome (available in GitHub Actions), prints the
     performance/accessibility/best-practices/SEO scores, and **fails the job if
     performance < 90**.
   - `e2e` job: runs `scripts/e2e/prod.mjs` against `PROD_BASE_URL` when the
     `RUN_E2E` repo variable is `true`.

---

## 5. Exact runbook to complete verification (owner action required)

Run these from a real environment with network + credentials (local machine or
GitHub Actions with the secrets):

1. **Provision backend** (always-on or serverless) with Postgres + Redis +
   worker. Deploy `apps/api` (see `PRODUCTION-README.md` §4).
2. **Set env vars** (backend): `DATABASE_URL`, `REDIS_URL`, `AUTH_JWT_SECRET`,
   `TRUST_PROXY`, `STRIPE_*`, AI keys, Google/Apple client IDs, `S3_*`.
3. **Set env vars** (frontend on Vercel): `API_UPSTREAM`, and OAuth URLs.
4. **Deploy** the web app to Vercel (this needs `VERCEL_TOKEN`).
5. **Run the live E2E:** `BASE=https://<prod-url> node scripts/e2e/prod.mjs`
   (set `TEST_STRIPE=1` and the OAuth URLs to exercise §5/§6).
6. **Run Lighthouse:** either the CI job above or
   `lighthouse <prod-url> --output=json` on a machine with Chrome.
7. Collect the results into the matrix and only then declare Production Ready.

---

## 6. Conclusion

- The **frontend is code-ready and statically verified**: it compiles, builds,
  serves every route, contains no demo/local engine, exposes only friendly
  states, and has a full-coverage E2E suite + Lighthouse CI ready to run.
- The **live production proof cannot be produced from this sandbox** due to
  hard infrastructure/credential blockers (no Prisma engine download, no
  Docker/apt for Postgres/Redis, no browser for Lighthouse, no Vercel/Stripe/
  OAuth credentials).
- Therefore I am **not** declaring the product Production-Ready. To complete
  this phase, run §5 in a real environment; the added CI artifacts will then
  emit the pass/fail evidence and the live URL.
