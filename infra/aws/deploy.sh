#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AutoCreator AI — AWS production deploy (API + Worker on ECS Fargate)
#
# Prereqs:  aws cli configured, AWS_REGION set, Docker available,
#           an ECR repo pair (autocreator/api, autocreator/worker),
#           jq and openssl. An ACM certificate is optional when using the ALB URL.
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
RUNTIME_SECRET_ID="${RUNTIME_SECRET_ID:-autocreator/prod/runtime}"

EXISTING_RUNTIME='{}'
if aws secretsmanager describe-secret --secret-id "$RUNTIME_SECRET_ID" --region "$AWS_REGION" >/dev/null 2>&1; then
  EXISTING_RUNTIME="$(aws secretsmanager get-secret-value \
    --secret-id "$RUNTIME_SECRET_ID" --region "$AWS_REGION" \
    --query SecretString --output text)"
fi
AUTH_JWT_SECRET="${AUTH_JWT_SECRET:-$(jq -r '.AUTH_JWT_SECRET // empty' <<<"$EXISTING_RUNTIME")}"
SECRETS_MASTER_KEY="${SECRETS_MASTER_KEY:-$(jq -r '.SECRETS_MASTER_KEY // empty' <<<"$EXISTING_RUNTIME")}"
if [ "${#AUTH_JWT_SECRET}" -lt 64 ]; then AUTH_JWT_SECRET="$(openssl rand -hex 32)"; fi
if [ "${#SECRETS_MASTER_KEY}" -lt 64 ]; then SECRETS_MASTER_KEY="$(openssl rand -hex 32)"; fi

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
  "AuthJwtSecret=${AUTH_JWT_SECRET}"
  "SecretsMasterKey=${SECRETS_MASTER_KEY}"
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

if [ -n "$API_DOMAIN" ]; then
  API_URL="https://${API_DOMAIN}"
else
  API_URL="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue | [0]" --output text)"
fi
echo ""
echo "  API  → ${API_URL}"
echo "  Runtime provider credentials remain managed in Secrets Manager: ${RUNTIME_SECRET_ID}"
echo "  Set on Vercel:  API_UPSTREAM=${API_URL}  PUBLIC_API_URL=${API_URL}  PUBLIC_WEB_URL=https://<vercel-domain>"
