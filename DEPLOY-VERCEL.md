# 🚀 النشر الكامل على Vercel (بدون Render) — 10 دقائق

## البنية

```
Vercel (Next.js web + /api/v1 proxy)
   │ API_UPSTREAM=https://<railway>.up.railway.app
   ▼
Railway (NestJS API: queue workers + ffmpeg)      ← railway.json
   │
   ├── Neon Postgres  (DATABASE_URL, pgvector)     ← schema pushed by GH Action
   └── Upstash Redis  (REDIS_URL, Streams)
```

> لماذا الـ API ليس على Vercel Functions؟ NestJS + عمال طوابير Redis Streams +
> ffmpeg (~30 ثانية لكل فيديو) تحتاج عملية دائمة؛ الدوال اللحظية محدودة المدة
> وبلا حالة. لهذا Vercel للواجهة + Railway/Fly للـ API — نفس تقسيم العمل الذي
> اقترحته.

---

## 1) قاعدة البيانات — Neon
1. سجل في https://console.neon.tech → New Project (Postgres 16).
2. انسخ `DATABASE_URL` (صيغة `postgresql://...`).

## 2) Redis — Upstash
1. سجل في https://console.upstash.com → Create Database (Global/Default).
2. انسخ `REDIS_URL` (يبدأ بـ `rediss://` — TLS مدعوم من ioredis).

## 3) الـ API — Railway
1. https://railway.app → **New Project → Deploy from GitHub repo** → اختر
   `aalgume2-ship-it/auto-publisher-ai` → الفرع `main`.
2. `railway.json` يُكتشف تلقائياً (Nixpacks): `pnpm install → db:generate →
   turbo build → start node apps/api/dist/main.js`.
3. في **Variables** أضف:
   ```
   DATABASE_URL=<من Neon>
   REDIS_URL=<من Upstash>
   AUTH_JWT_SECRET=<مفتاح عشوائي طويل — openssl rand -hex 32>
   AI_PROVIDER_MODE=demo
   SEED_ADMIN_ON_BOOT=true
   SEED_ADMIN_EMAIL=admin@autocreator.sa
   SEED_ADMIN_PASSWORD=<كلمة مرور قوية 12+>
   NODE_ENV=production
   ```
4. **الـ schema**: شغّل في Railway (أو محلياً مع `DATABASE_URL`):
   ```
   pnpm install --no-frozen-lockfile
   pnpm db:generate
   pnpm --filter @aca/database exec prisma db push
   pnpm db:seed
   ```
   > أو انسخ `infra/deploy/workflows/deploy-railway.yml` إلى
   > `.github/workflows/` وأضف secrets `DATABASE_URL` و `RAILWAY_TOKEN` —
   > الـ schema يُدفع تلقائياً عند كل push.
5. Health check: افتح `https://<service>.up.railway.app/health/ready`
   → يجب أن يرد `{"status":"ready","checks":{"postgres":"up","redis":"up"}}`.

## 4) الويب — Vercel
1. https://vercel.com → **New Project → Import Git Repository** → اختر المستودع.
2. Vercel يقرأ `vercel.json` تلقائياً (framework nextjs، build command جاهز).
3. في **Environment Variables** أضف:
   ```
   API_UPSTREAM=https://<railway-service>.up.railway.app
   ```
   (`NEXT_PUBLIC_API_BASE` غير مطلوب — الافتراضي `/api` نسبي عبر البروكسي.)
4. **Deploy**. بعد دقائق ستحصل على:
   ```
   https://auto-publisher-ai-<slug>.vercel.app
   ```
5. افتح الرابط → **سجّل حساباً جديداً** (يعمل الآن — أُصلح عيب uuidv7) →
   أنشئ Workspace → Channel → Asset → Series → Video → الفيديو يُولَّد في
   وضع Demo خلال ~30 ثانية → شغّله ونزّله.

> **نشر تلقائي لاحقاً:** انسخ `infra/deploy/workflows/deploy-vercel.yml` إلى
> `.github/workflows/` وأضف secrets: `VERCEL_TOKEN` (من
> vercel.com/account/tokens)، `VERCEL_ORG_ID` و `VERCEL_PROJECT_ID`
> (من `npx vercel link` ثم `vercel projects ls`). بعدها كل push على `main`
> ينشر تلقائياً.

## متغيرات اختيارية لاحقاً
- مفاتيح AI حقيقية (OpenAI/Groq/Gemini) → `AI_PROVIDER_MODE` تُزال، والمفاتيح
  تُضاف لمتغيرات Railway (أو من لوحة الإعدادات داخل التطبيق).
- وسائط خارج قاعدة البيانات: استخدم `S3_*` أو Vercel Blob — الافتراضي الحالي
  (جدول AssetBlob في Postgres) متين ويعمل بلا إعداد إضافي.

## التحقق بعد النشر
```
GET https://<vercel-url>/api/v1/health/        → 200 {"status":"ok",...}
GET https://<railway>.up.railway.app/health/ready → 200 {"checks":{"postgres":"up","redis":"up"}}
```
