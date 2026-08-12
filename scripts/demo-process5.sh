#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

for command in curl jq go; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Process 5 demo is blocked: missing command '$command'." >&2
    exit 2
  fi
done

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

BASE_URL=${PROCESS5_BASE_URL:-http://127.0.0.1:18080}
API_ADDR=${PROCESS5_API_ADDR:-:18080}
REUSE_API=${PROCESS5_REUSE_API:-false}
WORKER_METRICS_ADDR=${PROCESS5_WORKER_METRICS_ADDR:-127.0.0.1:19091}
DEMO_USER_ID=${PROCESS5_DEMO_USER_ID:-11111111-1111-4111-8111-111111111111}
OTHER_USER_ID=${PROCESS5_OTHER_USER_ID:-22222222-2222-4222-8222-222222222222}
DEMO_DIR=$(mktemp -d "${TMPDIR:-/tmp}/hacom-process5-demo.XXXXXX")
API_PID=
WORKER_PID=

cleanup() {
  if [ -n "$WORKER_PID" ]; then
    kill "$WORKER_PID" >/dev/null 2>&1 || true
    wait "$WORKER_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "$API_PID" ]; then
    kill "$API_PID" >/dev/null 2>&1 || true
    wait "$API_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$DEMO_DIR"
}
trap cleanup EXIT INT TERM

if curl --silent --fail "$BASE_URL/health/live" >/dev/null 2>&1; then
  if [ "$REUSE_API" != true ]; then
    echo "Process 5 demo refused to reuse an unverified API at $BASE_URL." >&2
    echo "Stop it, choose PROCESS5_API_ADDR/PROCESS5_BASE_URL, or explicitly set PROCESS5_REUSE_API=true." >&2
    exit 2
  fi
  echo "[1/7] Reusing the explicitly approved API at $BASE_URL"
else
  echo "[1/7] Starting API"
  API_ADDR="$API_ADDR" go run ./cmd/api >"$DEMO_DIR/api.log" 2>&1 &
  API_PID=$!
fi

echo "[2/7] Starting Worker"
WORKER_ID=process5-demo-worker \
WORKER_METRICS_ADDR="$WORKER_METRICS_ADDR" \
  go run ./cmd/worker >"$DEMO_DIR/worker.log" 2>&1 &
WORKER_PID=$!

ready=false
for _ in $(seq 1 30); do
  if ! kill -0 "$WORKER_PID" >/dev/null 2>&1; then
    echo "Worker exited before API readiness; check metrics address and runtime configuration." >&2
    exit 1
  fi
  if curl --silent --fail "$BASE_URL/health/ready" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  echo "API readiness failed. Inspect $DEMO_DIR/api.log before the script exits." >&2
  exit 1
fi

cloud_request() {
  curl --silent --show-error \
    -H "X-Demo-User-ID: $DEMO_USER_ID" \
    "$@"
}

echo "[3/7] Creating text and link items"
cloud_request \
  -H "Content-Type: application/json" \
  -d '{"content":"Process 5 release candidate"}' \
  "$BASE_URL/api/v1/cloud/texts" |
  jq -e '.type == "text" and .status == "ready"' >/dev/null
cloud_request \
  -H "Content-Type: application/json" \
  -d '{"url":"https://hacom.vn","title":"Hacom"}' \
  "$BASE_URL/api/v1/cloud/links" |
  jq -e '.type == "link" and .status == "ready"' >/dev/null

echo "[4/7] Uploading binary directly to MinIO and completing the session"
printf '%s' 'Process 5 demo file' >"$DEMO_DIR/demo.txt"
FILE_SIZE=$(wc -c <"$DEMO_DIR/demo.txt" | tr -d ' ')
initiate_response=$(cloud_request \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: process5-demo-$(date +%s)" \
  -d "{\"fileName\":\"demo.txt\",\"contentType\":\"text/plain\",\"sizeBytes\":$FILE_SIZE}" \
  "$BASE_URL/api/v1/cloud/uploads")
upload_url=$(printf '%s' "$initiate_response" | jq -er '.uploadUrl')
session_id=$(printf '%s' "$initiate_response" | jq -er '.uploadSessionId')
item_id=$(printf '%s' "$initiate_response" | jq -er '.itemId')
curl --silent --show-error --fail \
  -X PUT \
  -H "Content-Type: text/plain" \
  -H "If-None-Match: *" \
  --data-binary "@$DEMO_DIR/demo.txt" \
  "$upload_url" >/dev/null
cloud_request \
  -X POST \
  "$BASE_URL/api/v1/cloud/uploads/$session_id/complete" |
  jq -e '.item.status == "processing" and .job.type == "hash_file"' >/dev/null

echo "[5/7] Waiting for Worker to hash the file"
item_status=
for _ in $(seq 1 30); do
  if ! kill -0 "$WORKER_PID" >/dev/null 2>&1; then
    echo "Worker exited before completing the hash job." >&2
    exit 1
  fi
  item_response=$(cloud_request "$BASE_URL/api/v1/cloud/items/$item_id")
  item_status=$(printf '%s' "$item_response" | jq -r '.status')
  if [ "$item_status" = "ready" ]; then
    break
  fi
  sleep 1
done
if [ "$item_status" != "ready" ]; then
  echo "Worker did not make the file ready within 30 seconds." >&2
  exit 1
fi

echo "[6/7] Verifying ownership isolation and quota"
cross_owner_status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  -H "X-Demo-User-ID: $OTHER_USER_ID" \
  "$BASE_URL/api/v1/cloud/items/$item_id")
if [ "$cross_owner_status" != 404 ]; then
  echo "Cross-owner read returned HTTP $cross_owner_status, want 404." >&2
  exit 1
fi
cloud_request "$BASE_URL/api/v1/cloud/quota" |
  jq -e '.usedBytes >= 0 and .reservedBytes == 0 and .availableBytes >= 0' >/dev/null

echo "[7/7] Demo PASSED"
echo "Text, link, direct upload, Worker hash, ownership and quota completed successfully."
echo "No presigned URL or credential was printed."
