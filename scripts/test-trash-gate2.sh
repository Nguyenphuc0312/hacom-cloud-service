#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

for command in docker migrate go; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Trash Gate 2 is blocked: missing command '$command'." >&2
    exit 2
  fi
done

TEST_DB_NAME=${TRASH_GATE2_TEST_DB_NAME:-hacom_cloud_trash_gate2_test_$$}
case "$TEST_DB_NAME" in
  *[!A-Za-z0-9_]*|'')
    echo "TRASH_GATE2_TEST_DB_NAME must contain only letters, digits and underscores." >&2
    exit 2
    ;;
esac

POSTGRES_USER=${POSTGRES_USER:-hacom}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-hacom}
TEST_DATABASE_URL=${TRASH_GATE2_TEST_DATABASE_URL:-"postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${TEST_DB_NAME}?sslmode=disable"}
TEST_MINIO_ENDPOINT=${TEST_MINIO_ENDPOINT:-${MINIO_ENDPOINT:-localhost:9000}}

compose() {
  docker compose -f deployments/docker-compose.yml "$@"
}

psql_file() {
  compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" \
    -d "$TEST_DB_NAME" -f /dev/stdin < "$1"
}

cleanup() {
  compose exec -T postgres dropdb --if-exists -U "$POSTGRES_USER" \
    "$TEST_DB_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "[1/7] Starting isolated PostgreSQL and MinIO"
compose up -d postgres minio minio-init
cleanup
compose exec -T postgres createdb -U "$POSTGRES_USER" "$TEST_DB_NAME"

echo "[2/7] Migrating clean database through Trash lifecycle"
migrate -path migrations -database "$TEST_DATABASE_URL" up
psql_file scripts/verify-schema.sql

echo "[3/7] Running Gate 2 sequentially with race detector"
TEST_DATABASE_URL="$TEST_DATABASE_URL" \
TEST_MINIO_ENDPOINT="$TEST_MINIO_ENDPOINT" \
MINIO_ENDPOINT="$TEST_MINIO_ENDPOINT" \
go test -p 1 -race -count=1 \
  ./internal/trash \
  ./internal/cloudapi \
  ./internal/fileaccess \
  ./internal/repository \
  ./internal/worker/... \
  ./tests/contract \
  ./cmd/worker

echo "[4/7] Verifying no quota, ledger, Item, or reservation mismatch"
MISMATCHES=$(compose exec -T postgres psql -v ON_ERROR_STOP=1 -At \
  -U "$POSTGRES_USER" -d "$TEST_DB_NAME" -f /dev/stdin \
  < scripts/reconcile-trash-lifecycle.sql)
if [ -n "$MISMATCHES" ]; then
  echo "Trash Gate 2 reconciliation found mismatches:" >&2
  echo "$MISMATCHES" >&2
  exit 1
fi

echo "[5/7] Rolling migration 000006 down"
migrate -path migrations -database "$TEST_DATABASE_URL" down 1

echo "[6/7] Reapplying migration 000006"
migrate -path migrations -database "$TEST_DATABASE_URL" up 1
psql_file scripts/verify-schema.sql

echo "[7/7] Building API and Worker"
go vet ./...
go build ./cmd/api ./cmd/worker

echo "Trash Gate 2 PASSED: isolated DB, race, production Worker, reconciliation and rollback/up."
