#!/bin/bash
# التحقق من إعدادات وربط تخزين S3
set -euo pipefail

echo "=== 1. عرض متغيرات S3 من البيئة ==="
env | grep "^S3_" || echo "لم تُعرّف متغيرات S3 بعد"

echo ""
echo "=== 2. اختبار الاتصال بـ S3 (باستخدام aws cli) ==="
if command -v aws &>/dev/null; then
    aws s3 ls "s3://${S3_BUCKET_ASSETS:-}" 2>/dev/null || echo "لا يمكن الوصول إلى S3_BUCKET_ASSETS (تأكد من S3_ACCESS_KEY_ID و S3_SECRET_ACCESS_KEY)"
else
    echo "الأمر 'aws' غير مثبت؛ ثبّته أولاً: pip install awscli"
fi

echo ""
echo "=== 3. التحقق من إعدادات .env ==="
cat .env.example | grep "S3_" || echo "لا توجد إعدادات S3 في .env.example"

echo ""
echo "=== 4. نصائح الربط ==="
echo "- تأكد من ضبط: S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY"
echo "- تأكد من وجود الدلاء: S3_BUCKET_ASSETS, S3_BUCKET_RENDERS, S3_BUCKET_LOGS"
echo "- إذا لم تكن S3 مطلوبة حالياً، يبقى التخزين على PostgreSQL (AssetBlob) افتراضياً"
