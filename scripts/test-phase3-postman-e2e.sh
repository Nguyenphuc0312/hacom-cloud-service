#!/bin/sh
set -eu

: "${PHASE3_USER_TOKEN:?PHASE3_USER_TOKEN is required}"
: "${PHASE3_ADMIN_TOKEN:?PHASE3_ADMIN_TOKEN is required}"

CLOUD_BASE_URL=${PHASE3_CLOUD_BASE_URL:-http://localhost:8080}
ADMIN_BASE_URL=${PHASE3_ADMIN_BASE_URL:-http://localhost:3102}
QUOTA_TIER_BYTES=${PHASE3_QUOTA_TIER_BYTES:-10000000000}
REJECT_QUOTA_TIER_BYTES=${PHASE3_REJECT_QUOTA_TIER_BYTES:-25000000000}
COLLECTION=${POSTMAN_PHASE3_GATE3_COLLECTION:-tests/postman/Hacom-Cloud-Phase-3-Gate-3.postman_collection.json}

case "$QUOTA_TIER_BYTES,$REJECT_QUOTA_TIER_BYTES" in
  *[!0-9,]*) echo "Phase 3 quota tiers must be integer bytes" >&2; exit 2;;
esac

npx --yes newman run "$COLLECTION" \
  --env-var "cloudBaseUrl=$CLOUD_BASE_URL" \
  --env-var "adminBaseUrl=$ADMIN_BASE_URL" \
  --env-var "userToken=$PHASE3_USER_TOKEN" \
  --env-var "adminToken=$PHASE3_ADMIN_TOKEN" \
  --env-var "quotaTierBytes=$QUOTA_TIER_BYTES" \
  --env-var "rejectQuotaTierBytes=$REJECT_QUOTA_TIER_BYTES" \
  --reporters cli --silent

echo "Phase 3 live Postman E2E passed (silent mode protects tokens and request reason)."
