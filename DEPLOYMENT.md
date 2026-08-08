# AutoCreator AI — Production Deployment Guide

## Quick Start

هذا الدليل يشرح كيفية نشر AutoCreator AI على Vercel (web) و Railway (API).

### المتطلبات

- **Neon** — قاعدة بيانات PostgreSQL مجانية (console.neon.tech)
- **Upstash** — Redis مجاني (console.upstash.com)
- **Railway** — API hosting (railway.app)
- **Vercel** — Web hosting (vercel.com)
- **GitHub Secrets** — لتخزين بيانات الاعتماد

---

## الخطوة 1: إنشاء قاعدة البيانات (Neon)

```bash
# 1. اذهب إلى https://console.neon.tech
# 2. سجل دخول أو أنشئ حساب
# 3. اضغط "Create Project"
# 4. اختر "PostgreSQL 16"
# 5. انسخ DATABASE_URL (يبدأ بـ postgresql://)
# مثال:
# postgresql://neon_user:password@ep-xxx.us-east-1.neon.tech/autocreator
```

---

## الخطوة 2: إنشاء Redis (Upstash)

```bash
# 1. اذهب إلى https://console.upstash.com
# 2. اضغط "Create Database"
# 3. اختر "Redis"
# 4. اختر region قريب
# 5. انسخ REDIS_URL (يبدأ بـ rediss://)
# مثال:
# rediss://default:password@us1-xxx.upstash.io:xxxxx
```

---

## الخطوة 3: إعداد Railway

```bash
# 1. اذهب إلى https://railway.app
# 2. اضغط "New Project"
# 3. اختر "Deploy from GitHub repo"
# 4. اختر aalgume2-ship-it/auto-publisher-ai
# 5. Railway سيكتشف railway.json تلقائياً
# 6. أضف Environment Variables:

DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
AUTH_JWT_SECRET=your-secret-key-here (generate: openssl rand -hex 32)
AI_PROVIDER_MODE=demo
SEED_ADMIN_ON_BOOT=true
SEED_ADMIN_EMAIL=admin@autocreator.sa
SEED_ADMIN_PASSWORD=AdminRiyadh2026!
NODE_ENV=production
WEB_APP_URL=https://your-vercel-domain.vercel.app
```

---

## الخطوة 4: إعداد Vercel

```bash
# 1. اذهب إلى https://vercel.com
# 2. اضغط "Add New" → "Project"
# 3. اختر "Import Git Repository"
# 4. اختر aalgume2-ship-it/auto-publisher-ai
# 5. في "Build and Output settings":
#    - Build Command: pnpm build
#    - Output Directory: apps/web/.next
# 6. أضف Environment Variables:

API_UPSTREAM=https://your-railway-service.up.railway.app

# 7. اضغط "Deploy"
```

---

## الخطوة 5: تفعيل GitHub Actions (اختياري)

إذا أردت deployment تلقائي عند كل push إلى main:

```bash
# أضف هذه Secrets إلى GitHub:
# Settings → Secrets and variables → Actions

RAILWAY_TOKEN=xxx (من railway.app/account)
RAILWAY_PROJECT_ID=xxx
RAILWAY_ENVIRONMENT_ID=xxx
RAILWAY_API_URL=https://your-railway-service.up.railway.app

VERCEL_TOKEN=xxx (من vercel.com/account/tokens)
VERCEL_ORG_ID=xxx
VERCEL_PROJECT_ID=xxx
```

---

## الخطوة 6: التحقق من الصحة

```bash
# تحقق من صحة API:
curl https://your-railway-service.up.railway.app/v1/health/ready

# يجب أن تحصل على:
# {"status":"ok"}

# تسجيل الدخول:
curl -X POST https://your-railway-service.up.railway.app/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@autocreator.sa","password":"AdminRiyadh2026!"}'
```

---

## استكشاف الأخطاء

### لا يعمل API بعد النشر؟

```bash
# 1. تحقق من Logs في Railway
# railway.app → Your Project → Logs

# 2. تأكد من أن DATABASE_URL صحيح
# 3. تأكد من أن REDIS_URL صحيح
# 4. تأكد من AUTH_JWT_SECRET معرّف
```

### لا يعمل الويب بعد النشر؟

```bash
# 1. تحقق من Logs في Vercel
# vercel.com → Your Project → Deployments

# 2. تأكد من أن API_UPSTREAM صحيح
# 3. تأكد من أن build command صحيح
```

---

## الخطوات التالية

1. ✅ قاعدة البيانات جاهزة (Neon)
2. ✅ Redis جاهز (Upstash)
3. ✅ API مشغّل (Railway)
4. ✅ الويب مشغّل (Vercel)
5. 🔜 أنشئ workspace
6. 🔜 ربط قناة YouTube
7. 🔜 أنشئ فيديو
8. 🔜 ابدأ rendering

---

## الدعم

إذا واجهت مشاكل، راجع:
- `docs/Deployment.md` — شرح تفصيلي
- `docs/DEVELOPER-GUIDE.md` — تطوير محلي
- GitHub Issues — للإبلاغ عن مشاكل
