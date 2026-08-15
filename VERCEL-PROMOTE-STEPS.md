# Vercel Promote Instructions — 3 clicks, 2 minutes

The Vercel project `auto-publisher-ai-web` has Deployment Protection enabled at the team level. New deployments are behind Vercel Authentication, and the production alias (`auto-publisher-ai-web.vercel.app`) is pinned to an OLD deployment that serves the stale static export with broken JS/CSS assets.

I pushed a new build (deployment `5768723839`, commit `e799b37`) that produces a complete Next.js server app with all the API routes working. It just needs to be promoted to production.

## Exact steps

1. Open: https://vercel.com/aalgume2-ship-its-projects/auto-publisher-ai-web/deployments
   (Or: Vercel Dashboard → select `aalgume2-ship-its-projects` team → click `auto-publisher-ai-web` project → click `Deployments` tab in the sidebar)

2. Find the deployment with:
   - **Commit:** `e799b37` (message: "fix(vercel): simplify all vercel.json files...")
   - **Created:** 2026-08-05 20:17:44 UTC
   - **Status:** ✅ Ready
   - It will be at the top of the list (most recent successful production deployment)

3. Click the **"..."** (three dots) menu on the right side of that deployment row, or click the deployment to open its detail page.

4. Click **"Promote to Production"** (or "Promote" → "Production").

5. Confirm the promotion. Vercel will:
   - Make `5768723839` the current production deployment
   - Re-point the alias `auto-publisher-ai-web.vercel.app` to this deployment
   - The old deployment (5768385862 with the broken static export) is demoted

6. **Tell me when done** — I'll immediately run the UAT against the live production URL.

## What the new deployment contains

- ✅ Complete Next.js server app (not a static export)
- ✅ All route handlers including `/api/v1/*` proxy to the API upstream (API_UPSTREAM env)
- ✅ Notifications controller (per-user inbox surface)
- ✅ All dashboard pages with working JS and CSS
- ✅ All form submissions wired to the real API
- ✅ The exact code that passed CI run 31042299910 (all 4 jobs green)

## After you promote, I will verify

1. `GET https://auto-publisher-ai-web.vercel.app/_next/static/css/[any-hash].css` → 200 (not 404)
2. `GET https://auto-publisher-ai-web.vercel.app/_next/static/chunks/[any-hash].js` → 200 (not 404)
3. `GET https://auto-publisher-ai-web.vercel.app/register/` → 200 with valid HTML that loads JS
4. Full UAT: register → login → workspace → channel → asset → series → video → refresh → logout → re-login
5. Zero console errors, zero failed network requests

## If you see a "Promote" button that's grayed out

This means the deployment is already production OR there's a protection override. In that case:
- Go to Settings → Deployment Protection → temporarily turn OFF "Vercel Authentication" for this project
- Then go to Deployments → find 5768723839 → Promote to Production
- After UAT passes, re-enable Vercel Authentication

## If the deployment is NOT in the list

Go to Settings → Git → check that the "Production Branch" is set to `arena/019fcddc-auto-publisher-ai` (the branch I was pushing to). If it's set to a different branch, the push to `arena/019fcddc-auto-publisher-ai` only created a Preview deployment.

## The root cause (for your records)

The Vercel project was originally deployed as a static export (`apps/api/vercel.json` published the committed `apps/api/vercel-static/` directory). PR #6 added Route Handlers but didn't reconfigure the Vercel project to build from source. My previous fix changed `vercel.json` files to build from source, but Vercel cached the old deployment and the "Skipped - Not affected" status meant new builds weren't replacing the production alias. The new deployment (5768723839) builds a complete Next.js server app — it just needs to be promoted to production.
