#!/bin/bash
# Health check script for /health/ready
API_URL="${API_URL:-https://your-railway-service.up.railway.app}"

echo "Testing health endpoint at: $API_URL/health/ready"
response=$(curl -sf --max-time 10 "${API_URL}/health/ready" 2>/dev/null || echo '{"status":"error","message":"Connection failed"}')
echo "Response: $response"

if echo "$response" | grep -q '"status":"ready"'; then
    echo "✅ Health check PASSED (postgres + redis up)"
else
    echo "❌ Health check FAILED or degraded"
fi
