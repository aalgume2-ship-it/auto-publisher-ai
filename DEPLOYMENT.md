# Deploy — AutoPublisher AI (AWS + Vercel)

> البنية المعتمدة: **Vercel (web) ← AWS (API + Worker + PostgreSQL + Redis + S3)**.
> لا يُستخدم Railway في أي جزء من النظام.

```
User
  ↓
Vercel (apps/web)
  ↓  /api/v1/* proxy (API_UPSTREAM)
AWS ALB (HTTPS)
  ↓
ECS Fargate — apps/api  (port 3000)
  ↓
PostgreSQL (RDS) · Redis (ElastiCache) · S3 (assets/renders/logs)
  ↓
ECS Fargate — apps/worker (BullMQ: generation, image-generation, dubbing,
                           publish, render, thumbnail + campaign scheduler)
```

## 1) البنية التحتية على AWS

```bash
# المتطلبات: aws cli، Docker، ACM certificate، domain
export AWS_REGION=eu-central-1
export API_DOMAIN=api.autocreator.ai
export CERT_ARN=arn:aws:acm:eu-central-1:...

# يبني الصور (ECR)، يدفعها، وينشر CloudFormation
./infra/aws/deploy.sh
```

المكوّنات (infra/aws/cloudformation.yml):
- VPC (public/private subnets ×2، NAT، Internet Gateway)
- ALB مع HTTPS (ACM) + target group على `/health/ready`
- ECS Fargate: خدمة `api` (3000) وخدمة `worker` (8080) — awsvpc، CloudWatch Logs
- RDS PostgreSQL 16 (encrypted، backups 14 يوم)
- ElastiCache Redis (snapshots 7 أيام)
- S3 buckets: `*-assets` / `*-renders` (expire 90d) / `*-logs` (expire 30d) — كلها private + SSE
- Secrets Manager: `autocreator/prod/db` + `autocreator/prod/runtime` (كل الأسرار)
- IAM: least-privilege (S3 + Secrets Manager فقط)

## 2) المتغيرات على AWS Secrets Manager (`autocreator/prod/runtime`)

```json
{
  "AUTH_JWT_SECRET": "<openssl rand -hex 32>",
  "SECRETS_MASTER_KEY": "<openssl rand -hex 32>",
  "OPENAI_API_KEY": "", "GROQ_API_KEY": "", "GEMINI_API_KEY": "",
  "RUNWAY_API_KEY": "", "LUMA_API_KEY": "", "FAL_KEY": "",
  "STABILITY_API_KEY": "", "REPLICATE_API_TOKEN": "", "ELEVENLABS_API_KEY": "",
  "GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": "",
  "TIKTOK_CLIENT_KEY": "", "TIKTOK_CLIENT_SECRET": "",
  "META_APP_ID": "", "META_APP_SECRET": "",
  "STRIPE_SECRET_KEY": "", "STRIPE_WEBHOOK_SECRET": "",
  "PUBLIC_API_URL": "https://api.autocreator.ai",
  "S3_ACCESS_KEY_ID": "", "S3_SECRET_ACCESS_KEY": "",
  "S3_BUCKET": "autocreator-<account>-assets"
}
```

## 3) Vercel (web)

في Vercel project env:

```
API_UPSTREAM=https://api.autocreator.ai
PUBLIC_API_URL=https://api.autocreator.ai
PUBLIC_WEB_URL=https://<your-app>.vercel.app
NODE_ENV=production
```

الـ proxy في `apps/web/src/app/api/v1/[...path]/route.ts` يمرر `/api/v1/*` و `/health/*`
إلى `API_UPSTREAM` فقط — لا fallback إلى أي مزود آخر.

## 4) قاعدة البيانات (Prisma)

```bash
# Development
pnpm db:generate
pnpm db:dev          # prisma migrate dev

# Production (AWS ECS init/start أو GitHub Actions)
pnpm db:generate
pnpm db:migrate      # prisma migrate deploy — أبدًا db push في production
```

- migration: `packages/database/prisma/migrations/20260811102342_init`
- pgvector extension مُثبتة على RDS (`CREATE EXTENSION vector`) — مطلوبة للأعمدة `Unsupported("vector")`

## 5) التحقق

```bash
curl https://api.autocreator.ai/health/live    # {"status":"alive"}
curl https://api.autocreator.ai/health/ready   # {"status":"ready","checks":{"postgres":"up","redis":"up"}}
curl https://api.autocreator.ai/health/providers  # per-provider configured flag (بدون أسرار)
```

## 6) GitHub Actions

- `deploy-aws.yml` (يُضاف عبر GitHub UI — يحتاج صلاحية workflows): OIDC → ECR build/push → CloudFormation deploy → smoke test
- `deploy-vercel.yml`: build web + `vercel deploy`
- `ci.yml`: lint / typecheck / test / prisma validate
