# Deploy Vercel — AutoPublisher AI (Web)

> الواجهة على Vercel، والـ API + Worker على AWS. لا يوجد Railway.

```
   User
    ↓
  Vercel (apps/web)
    ↓  /api/v1/*  ← serverless proxy (API_UPSTREAM)
  AWS ALB (HTTPS)
    ↓
  ECS Fargate: apps/api + apps/worker
```

## 1) ربط المشروع

1. Vercel → **New Project** → استورد `auto-publisher-ai`.
2. Framework preset: **Next.js** (يكتشف `apps/web` تلقائياً عبر `vercel.json`).
3. Root Directory: `apps/web`.

## 2) متغيرات البيئة على Vercel

```
API_UPSTREAM=https://api.autocreator.ai   ← AWS ALB/API domain (الوحيد)
PUBLIC_API_URL=https://api.autocreator.ai
PUBLIC_WEB_URL=https://<app>.vercel.app
NODE_ENV=production
```

لا تُوضع أي أسرار AWS أو مفاتيح مزودين في Vercel — كلها في AWS Secrets Manager.
الـ proxy (`apps/web/src/app/api/v1/[...path]/route.ts`) يمرر الطلبات إلى
`API_UPSTREAM` فقط؛ إذا لم يُضبط، يُرجع `503 UPSTREAM_NOT_CONFIGURED` (لا fallback).

## 3) الـ API — AWS (بديل Railway)

راجع `DEPLOYMENT.md` أو نفّذ:

```bash
./infra/aws/deploy.sh
```

## 4) الـ schema / migrations

تُدار على AWS RDS عبر `prisma migrate deploy` (انظر `DEPLOYMENT.md` §4).
لا تُنفَّذ migrations من Vercel.

## 5) التحقق بعد النشر

```bash
curl https://<app>.vercel.app/api/v1/health/ready   # عبر الـ proxy → AWS
curl https://api.autocreator.ai/health/ready        # مباشرة على AWS
```
