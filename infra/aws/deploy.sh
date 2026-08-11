#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AutoCreator AI — AWS production deploy (API + Worker on ECS Fargate)
#
# Prereqs:  aws cli configured, AWS_REGION set, Docker available,
#           an ECR repo pair (autocreator/api, autocreator/worker),
#           ACM certificate for the API domain.
#
# Usage:
#   export AWS_REGION=eu-central-1
#   export API_DOMAIN=api.autocreator.ai
#   export CERT_ARN=arn:aws:acm:eu-central-1:...
#   ./infra/aws/deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

AWS_REGION="${AWS_REGION:-eu-central-1}"
API_DOMAIN="${API_DOMAIN:-}"
CERT_ARN="${CERT_ARN:-}"
STACK="${STACK:-autocreator-prod}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

API_REPO="${API_REPO:-autocreator/api}"
WORKER_REPO="${WORKER_REPO:-autocreator/worker}"
API_IMAGE="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${API_REPO}:latest"
WORKER_IMAGE="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${WORKER_REPO}:latest"

echo "▶ ensuring ECR repos…"
aws ecr describe-repositories --repository-names "${API_REPO}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${API_REPO}" --region "$AWS_REGION" >/dev/null
aws ecr describe-repositories --repository-names "${WORKER_REPO}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${WORKER_REPO}" --region "$AWS_REGION" >/dev/null

echo "▶ building images…"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
docker build -f Dockerfile.api -t "${API_IMAGE}" .
docker build -f Dockerfile.worker -t "${WORKER_IMAGE}" .

echo "▶ pushing images…"
docker push "${API_IMAGE}"
docker push "${WORKER_IMAGE}"

PARAMS=(
  "EnvironmentName=prod"
  "ApiImage=${API_IMAGE}"
  "WorkerImage=${WORKER_IMAGE}"
)
if [ -n "${API_DOMAIN}" ]; then PARAMS+=("ApiDomain=${API_DOMAIN}"); fi
if [ -n "${CERT_ARN}" ]; then PARAMS+=("CertificateArn=${CERT_ARN}"); fi

echo "▶ deploying CloudFormation stack ${STACK}…"
aws cloudformation deploy \
  --stack-name "${STACK}" \
  --template-file infra/aws/cloudformation.yml \
  --parameter-overrides "${PARAMS[@]}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$AWS_REGION"

echo "▶ writing runtime secrets (fill values, never commit)…"
aws secretsmanager put-secret-value \
  --secret-id "autocreator/prod/runtime" \
  --secret-string "$(cat <<'JSON'
{
  "AUTH_JWT_SECRET": "",
  "SECRETS_MASTER_KEY": "",
  "OPENAI_API_KEY": "",
  "GROQ_API_KEY": "",
  "GEMINI_API_KEY": "",
  "RUNWAY_API_KEY": "",
  "LUMA_API_KEY": "",
  "FAL_KEY": "",
  "GOOGLE_CLIENT_ID": "",
  "GOOGLE_CLIENT_SECRET": "",
  "TIKTOK_CLIENT_KEY": "",
  "TIKTOK_CLIENT_SECRET": "",
  "META_APP_ID": "",
  "META_APP_SECRET": "",
  "STRIPE_SECRET_KEY": "",
  "STRIPE_WEBHOOK_SECRET": "",
  "PUBLIC_API_URL": "https://${API_DOMAIN}",
  "S3_ACCESS_KEY_ID": "",
  "S3_SECRET_ACCESS_KEY": "",
  "S3_BUCKET": "autocreator-${ACCOUNT_ID}-assets"
}
JSON
)"

API_URL="https://${API_DOMAIN:-<ALB-DNS>}"
echo ""
echo "  API  → ${API_URL}"
echo "  Set on Vercel:  API_UPSTREAM=${API_URL}  PUBLIC_API_URL=${API_URL}  PUBLIC_WEB_URL=https://<vercel-domain>"
