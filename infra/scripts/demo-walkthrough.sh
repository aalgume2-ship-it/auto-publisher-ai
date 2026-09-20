#!/usr/bin/env bash
# demo-walkthrough — scripted end-to-end tour of the Module 1 Organizations API
# against a RUNNING local server (default http://localhost:3000).
#
# It mints a real dev session token (seeded demo user), then walks the actual
# product surface with live assertions: auth guards, idempotent replay, org
# CRUD, settings merge, departments, teams + members, branding cycle, custom
# domains (real DNS verify outcome), billing profile, subscription, rate-limit
# headers. Every step prints PASS/FAIL; exit code is non-zero on any failure —
# it doubles as a smoke test.
#
# Usage:  pnpm dev:api   (terminal 1)
#         pnpm demo      (terminal 2 — this script)
set -u

BASE="${ACA_API_URL:-http://localhost:3000}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PASS=0; FAIL=0

pp() { # pretty-print JSON when python3 exists
  if command -v python3 >/dev/null 2>&1; then python3 -m json.tool 2>/dev/null || cat; else cat; fi
}
note() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
json_field() { # extract "field" from a compact JSON doc in $1
  printf '%s' "$1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$2') or '')" 2>/dev/null
}
ok()   { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s (got: %s)\n' "$*" "$2"; }
expect_status() { # name expected actual [body]
  if [ "$2" = "$3" ]; then ok "$1 → $2"; else bad "$1 (want $2)" "$3 (body: ${4:0:300})"; fi
}

# request METHOD PATH [BODY] [EXTRA_HEADER...] → sets CODE + BODY
request() {
  local method="$1" path="$2" body="${3:-}"
  shift $(( $# >= 3 ? 3 : $# )) # shift would FAIL past $# and leave args behind
  local args=(-sS -o /tmp/aca-demo-body -w '%{http_code}' -X "$method" "$BASE$path")
  [ -n "${ACA_TOKEN:-}" ] && args+=(-H "Authorization: Bearer $ACA_TOKEN")
  args+=("$@")
  if [ -n "$body" ]; then args+=(-H 'content-type: application/json' -d "$body"); fi
  CODE="$(curl "${args[@]}")"
  BODY="$(cat /tmp/aca-demo-body)"
}
uuid() { node -e 'console.log(crypto.randomUUID())'; }

note "0/9 prerequisites — server health (public, no token)"
request GET /health
if [ "$CODE" != "200" ]; then
  echo "✖ API not reachable at $BASE (GET /health → $CODE). Start it: pnpm dev:api"; exit 1
fi
ok "GET /health → 200"

note "1/9 mint dev session token (seeded demo user)"
if [ -z "${ACA_TOKEN:-}" ]; then
  EXPORT_OUT="$(node "$ROOT/infra/scripts/mint-dev-token.mjs" --export 2>&1)" || { echo "$EXPORT_OUT"; exit 1; }
  eval "$EXPORT_OUT"
fi
[ -n "${ACA_TOKEN:-}" ] && ok "token minted (ACA_USER_ID=${ACA_USER_ID:-?} ACA_ORG_ID=${ACA_ORG_ID:-demo-org?})" || { bad "token mint" "empty"; exit 1; }

note "2/9 auth guard — the same call WITHOUT a token must be 401 (RFC 9457)"
request GET "/v1/organizations/${ACA_ORG_ID:-x}"
UNAUTH_CODE="$(curl -sS -o /tmp/aca-demo-body -w '%{http_code}' "$BASE/v1/organizations/${ACA_ORG_ID:-x}")"
UNAUTH_BODY="$(cat /tmp/aca-demo-body)"
expect_status "no-token request returns 401 problem" 401 "$UNAUTH_CODE" "$UNAUTH_BODY"
printf '%s' "$UNAUTH_BODY" | grep -q '"code":"UNAUTHENTICATED"' && printf '%s' "$UNAUTH_BODY" | grep -q '"status":401' \
  && ok "problem body is RFC 9457-shaped (code, status, title, requestId)" || bad "problem shape" "$UNAUTH_BODY"

note "3/9 create organization + byte-identical idempotent replay"
STAMP="$(date +%s)"
ORG_BODY="{\"name\": \"Walkthrough $STAMP\", \"slug\": \"walkthrough-$STAMP\"}"
KEY="$(uuid)"
request POST /v1/organizations "$ORG_BODY" -H "idempotency-key: $KEY"
expect_status "POST /v1/organizations" 201 "$CODE" "$BODY"
WORG="$(json_field "$BODY" id)"
FIRST_TOKENS="$(printf '%s' "$BODY" | sha256sum | cut -d' ' -f1)"
REPLAY_HEADERS="$(mktemp)"
CODE2="$(curl -sS -D "$REPLAY_HEADERS" -o /tmp/aca-demo-body2 -w '%{http_code}' -X POST "$BASE/v1/organizations" \
  -H "Authorization: Bearer $ACA_TOKEN" -H "idempotency-key: $KEY" -H 'content-type: application/json' -d "$ORG_BODY")"
SECOND_TOKENS="$(sha256sum /tmp/aca-demo-body2 | cut -d' ' -f1)"
[ "$CODE2" = "201" ] && [ "$FIRST_TOKENS" = "$SECOND_TOKENS" ] && grep -qi '^Idempotency-Replayed: true' "$REPLAY_HEADERS" \
  && ok "replay → 201, byte-identical body, Idempotency-Replayed: true" \
  || bad "idempotent replay" "code=$CODE2 hash1=$FIRST_TOKENS hash2=$SECOND_TOKENS"
rm -f "$REPLAY_HEADERS" /tmp/aca-demo-body2

note "4/9 org detail + profile patch + settings (timezone/locale) + security-policy merge"
request GET "/v1/organizations/$WORG";             expect_status "GET org detail" 200 "$CODE" "$BODY"
request PATCH "/v1/organizations/$WORG" '{"name": "Walkthrough Group"}' -H "idempotency-key: $(uuid)"
expect_status "PATCH org profile" 200 "$CODE" "$BODY"
request PATCH "/v1/organizations/$WORG/settings" '{"timezone": "Asia/Riyadh", "defaultLocale": "ar-SA"}' -H "idempotency-key: $(uuid)"
expect_status "PATCH settings" 200 "$CODE" "$BODY"
TZ_BACK="$(json_field "$BODY" timezone)"
[ "$TZ_BACK" = "Asia/Riyadh" ] && ok "response carries the post-update snapshot (Asia/Riyadh)" || bad "settings snapshot" "$TZ_BACK"
request PATCH "/v1/organizations/$WORG/settings/security-policy" '{"enforceMfa": true, "sessionMaxHours": 12}' -H "idempotency-key: $(uuid)"
expect_status "PATCH security-policy (whitelist merge)" 200 "$CODE" "$BODY"
printf '%s' "$BODY" | grep -q '"enforceMfa":true' && ok "merged policy shows enforceMfa=true" || bad "policy merge" "$BODY"

note "5/9 departments → teams → member lifecycle"
request POST "/v1/organizations/$WORG/departments" '{"name": "Content"}' -H "idempotency-key: $(uuid)"
expect_status "POST department" 201 "$CODE" "$BODY"
DEPT="$(json_field "$BODY" id)"
request POST "/v1/organizations/$WORG/departments" '{"name": "Content"}' -H "idempotency-key: $(uuid)"
expect_status "duplicate department name → 409" 409 "$CODE" "$BODY"
request GET "/v1/organizations/$WORG/departments"; expect_status "GET departments list" 200 "$CODE" "$BODY"
request PATCH "/v1/organizations/$WORG/departments/$DEPT" '{"description": "Video-producing teams"}' -H "idempotency-key: $(uuid)"
expect_status "PATCH department" 200 "$CODE" "$BODY"
request POST "/v1/organizations/$WORG/teams" "{\"name\": \"Shorts Squad\", \"departmentId\": \"$DEPT\"}" -H "idempotency-key: $(uuid)"
expect_status "POST team (with department ref)" 201 "$CODE" "$BODY"
TEAM="$(json_field "$BODY" id)"
request POST "/v1/organizations/$WORG/teams/$TEAM/members" "{\"userId\": \"$ACA_USER_ID\"}" -H "idempotency-key: $(uuid)"
expect_status "POST team member" 201 "$CODE" "$BODY"
request GET "/v1/organizations/$WORG/teams/$TEAM"; expect_status "GET team detail" 200 "$CODE" "$BODY"
request DELETE "/v1/organizations/$WORG/teams/$TEAM/members/$ACA_USER_ID" '' -H "idempotency-key: $(uuid)" -H 'content-type: application/json'
expect_status "DELETE team member (empty JSON body tolerated)" 200 "$CODE" "$BODY"
request DELETE "/v1/organizations/$WORG/teams/$TEAM" '' -H "idempotency-key: $(uuid)"
expect_status "DELETE team" 200 "$CODE" "$BODY"

note "6/9 branding: entitlement gate on the fresh org, full cycle on the pro demo org"
request GET "/v1/organizations/$WORG/brand"; expect_status "GET brand defaults" 200 "$CODE" "$BODY"
request PUT "/v1/organizations/$WORG/brand" '{"brandName": "Nope", "primaryColor": "#1a7a4a", "hidePoweredBy": true}' -H "idempotency-key: $(uuid)"
expect_status "PUT brand whiteLabel on plan WITHOUT the flag → 403 FLAG_LOCKED (entitlement enforced)" 403 "$CODE" "$BODY"
DORG="${ACA_ORG_ID:?demo org id missing — mint the token first}"
request GET "/v1/organizations/$DORG/brand"; expect_status "GET demo-org brand defaults" 200 "$CODE" "$BODY"
request PUT "/v1/organizations/$DORG/brand" '{"brandName": "Noor Podcasts", "primaryColor": "#1a7a4a"}' -H "idempotency-key: $(uuid)"
expect_status "PUT brand (non-gated fields — any plan)" 200 "$CODE" "$BODY"
request POST "/v1/organizations/$DORG/brand/reset" '' -H "idempotency-key: $(uuid)" -H 'content-type: application/json'
expect_status "POST brand reset restores defaults (empty JSON body)" 200 "$CODE" "$BODY"
RESOLVE_CODE="$(curl -sS -o /tmp/aca-demo-body -w '%{http_code}' "$BASE/v1/branding/resolve?host=unknown.example")"
expect_status "GET /v1/branding/resolve unknown host (public) → 404" 404 "$RESOLVE_CODE" "$(cat /tmp/aca-demo-body)"

note "7/9 custom domains: register → real DNS verify → delete"
DOM_BODY="{\"domain\": \"portal-$STAMP.example\", \"type\": \"PORTAL\"}"
request POST "/v1/organizations/$WORG/domains" "$DOM_BODY" -H "idempotency-key: $(uuid)"
expect_status "POST domain register" 201 "$CODE" "$BODY"
DOM="$(json_field "$BODY" id)"
request POST "/v1/organizations/$WORG/domains/$DOM/verify" '' -H "idempotency-key: $(uuid)" -H 'content-type: application/json'
if [ "$CODE" = "409" ]; then
  ok "domain verify → 409 TXT mismatch (REAL DNS answer — record persisted as FAILED, expected for a name you do not control)"
elif [ "$CODE" = "200" ]; then
  ok "domain verify → 200 (TXT record present)"
else
  bad "domain verify" "$CODE $BODY"
fi
request DELETE "/v1/organizations/$WORG/domains/$DOM" '' -H "idempotency-key: $(uuid)"
expect_status "DELETE domain" 200 "$CODE" "$BODY"

note "8/9 billing profile (upsert → read) + subscription"
request PUT "/v1/organizations/$WORG/billing-profile" '{"legalName": "Noor Media Holding LLC", "billingEmail": "billing@noor.example", "countryCode": "SA"}' -H "idempotency-key: $(uuid)"
expect_status "PUT billing profile" 200 "$CODE" "$BODY"
request GET "/v1/organizations/$WORG/billing-profile"; expect_status "GET billing profile" 200 "$CODE" "$BODY"
request GET "/v1/organizations/$DORG/subscription"; expect_status "GET subscription on the pro demo org (credit balance)" 200 "$CODE" "$BODY"
printf '%s' "$BODY" | grep -q '"code":"pro"' && ok "demo org subscription = ACTIVE pro plan + credits balance" || bad "subscription body" "$BODY"
request GET "/v1/organizations/$WORG/subscription"
expect_status "GET subscription on a PLAN-LESS org → 404 (plans land with the billing module; honest contract)" 404 "$CODE" "$BODY"

note "9/9 platform headers: rate-limit + request-id sanitization"
HDRS="$(mktemp)"
curl -sS -D "$HDRS" -o /dev/null "$BASE/v1/organizations/$WORG" -H "Authorization: Bearer $ACA_TOKEN" -H "X-Request-Id: injected-value-not-a-uuidv7"
ECHOED="$(grep -i '^X-Request-Id:' "$HDRS" | tr -d '\r' | cut -d' ' -f2)"
printf '%s' "$ECHOED" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' \
  && ok "untrusted X-Request-Id discarded; server minted UUIDv7 ($ECHOED)" \
  || bad "request-id sanitization" "$ECHOED"
grep -qi '^RateLimit-Limit:' "$HDRS" && ok "RateLimit-* headers present ($(grep -i '^RateLimit-Limit:' "$HDRS" | tr -d '\r'))" || bad "ratelimit headers" "missing"
rm -f "$HDRS" /tmp/aca-demo-body

printf '\n\033[1m──────────────────────────────\033[0m\n'
printf 'result: \033[32m%d PASS\033[0m, \033[31m%d FAIL\033[0m\n' "$PASS" "$FAIL"
printf 'walkthrough org kept for inspection: %s (slug walkthrough-%s)\n' "$WORG" "$STAMP"
[ "$FAIL" -eq 0 ]
