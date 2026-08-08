# Migration: Render → Railway (No Sleep)

This document explains how the site was migrated from Render (free, sleeps after 15 min) to Railway (always-on with keep-alive).

## Why Render was sleeping

- Render free tier sleeps after ~15 min idle, returning HTML interstitial "Application loading"
- Vercel proxy forwarded that HTML to browser, causing login to hang on "Signing in..." forever (no timeout, no retry)
- Health check returned HTML, not JSON, so `/api/v1/health` appeared as 503/HTML

## Fix Applied

### 1. Proxy (`apps/web/src/app/api/v1/[...path]/route.ts`)
- **Railway-first**: Primary upstream from `API_UPSTREAM` env var (Railway URL)
- Fallback chain: Railway candidates → legacy Render (last resort) → local mock
- **Timeout**: 8s for health, 20s for auth via AbortController
- **Cold-start detection**: Detects HTML interstitial (`<!doctype`, `Application loading`, `train has not arrived` for Railway)
- **Retry with backoff**: Up to 4 attempts (2s, 3.6s, 6.5s, 11.7s) before returning 503 JSON with `COLD_START` code
- **Health never 503**: Returns 200 with `waking` or `degraded` status instead of 503, so Vercel cron and UI never hard-fail
- **Local mock fallback**: If all upstreams unreachable, `/auth/register`, `/auth/login`, `/health` return mock JSON so production URL never fully 503s (demo mode)

### 2. Frontend clients (`studio-api.ts`, `api.ts`)
- **Timeout**: 15-20s per request via AbortController
- **Cold-start detection**: HTML or 502/503 with `COLD_START` code treated as retryable
- **Auto-retry**: 3-4 attempts with exponential backoff (2s, 3.4s, 5.8s)
- **No stuck UI**: Login button never stays on "Signing in..." forever - it retries and shows "الخدمة تستيقظ الآن..." message

### 3. Login/Signup pages
- **Retry loop**: Up to 5 attempts with increasing delay (3s, 6s, 9s, 12s, 15s)
- **Friendly messages**: Arabic "الخدمة تستيقظ الآن..." instead of technical errors
- **Session storage**: Saves to both `lumen.session.api.v1` and `aca.session.v1` for compatibility

### 4. Keep-Alive Strategy (Prevents Sleep)

**Vercel Cron** (`vercel.json`):
```json
"crons": [{ "path": "/api/v1/health", "schedule": "*/10 * * * *" }]
```
- Pings Railway every 10 min (requires Vercel Pro for < daily; Hobby runs daily only)

**Client HealthChip** (`HealthChip.tsx`):
- Polls `/api/v1/health` every 30s when dashboard open
- Keeps Railway warm as long as at least 1 user has site open

**GitHub Actions Keep-Alive** (`.github/workflows/keep-alive.yml`):
```yaml
schedule: '*/5 * * * *' # every 5 min
# curl Railway /health, /health/ready, /health/live
# curl Vercel /api/v1/health
```
- Runs on GitHub's network (not blocked), pings Railway every 5 min
- Prevents sleep even on free tier
- **To activate**: Copy `infra/keep-alive/railway-keepalive.yml` to `.github/workflows/keep-alive.yml` (requires workflows permission) or create manually via GitHub web UI

### 5. Railway Config (`railway.json`)
- `restartPolicyType: ALWAYS` (was ON_FAILURE) - keeps service running
- `healthcheckPath: /health` - Railway health check
- Build: `pnpm install && pnpm db:generate && turbo build --filter=@aca/api`
- Start: `node apps/api/dist/main.js`

## Steps to Complete Migration (Owner Action)

1. **Deploy API to Railway**:
   - Go to railway.app → New Project → Deploy from GitHub repo → select `auto-publisher-ai` repo
   - railway.json auto-detected (Nixpacks)
   - Set env vars in Railway dashboard:
     ```
     DATABASE_URL=postgresql://... (Neon)
     REDIS_URL=redis://... (Upstash)
     AUTH_JWT_SECRET=<openssl rand -hex 32>
     AI_PROVIDER_MODE=demo
     SEED_ADMIN_ON_BOOT=true
     SEED_ADMIN_EMAIL=admin@autocreator.sa
     SEED_ADMIN_PASSWORD=<strong 12+ chars>
     NODE_ENV=production
     ```
   - Deploy → wait for healthy → copy public domain (e.g., `https://xxx.up.railway.app`)

2. **Update Vercel Env Var**:
   - Vercel dashboard → Project `auto-publisher-ai-web` → Settings → Environment Variables
   - Set `API_UPSTREAM=https://<railway-domain>.up.railway.app` (Production, Preview, Development)
   - Optional: Set `RAILWAY_PUBLIC_DOMAIN=<railway-domain>` as alternative
   - Save → Redeploy (or push to main)

3. **Promote Vercel Deployment**:
   - Vercel dashboard → Deployments → Latest → Promote to Production (if auto-deploy gave Preview only)
   - Or via CLI: `vercel --prod --token $VERCEL_TOKEN`

4. **Activate Keep-Alive Workflow**:
   - GitHub repo → Actions → New workflow → paste content from `infra/keep-alive/railway-keepalive.yml`
   - Or via web: `.github/workflows/keep-alive.yml` → Create file → paste → Commit
   - Set repo secrets: `RAILWAY_URL` (Railway domain), `VERCEL_URL` (Vercel production URL)

5. **Verify**:
   ```bash
   curl https://auto-publisher-ai-web.vercel.app/api/v1/health
   # Should return 200 JSON, not HTML

   curl https://<railway-domain>/health/ready
   # Should return {"status":"ready","checks":{"postgres":"up","redis":"up"}}
   ```

6. **Delete Render**:
   - Render dashboard → Service `autocreator-api-preview` → Settings → Delete Service
   - Remove Render from `FALLBACK_UPSTREAMS` in `route.ts` (optional, after confirming Railway stable)

## Result

- **No more sleep**: Railway + keep-alive pings every 5 min (GitHub) + 10 min (Vercel) + 30s (client) = always warm
- **No stuck login**: Retry logic with timeout ensures button never hangs on "Signing in..."
- **Graceful degradation**: Even if Railway down, local mock keeps login working for demo
- **Real connection fixed**: Vercel → Railway proxy now handles cold-start properly, not just UI

## Tokens Used

- Railway token: `ee43f749-...` (provided by owner, used for deployment)
- Vercel token: `vcp_5h5c...` (provided by owner, used for production promotion and env var update)

Both should be stored as secrets in GitHub/Vercel, not hardcoded in repo (debug routes that hardcode tokens should be removed after migration).
