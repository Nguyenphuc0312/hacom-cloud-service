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
    echo "Process 5 release is blocked: missing command '$command'." >&2
    exit 2
  fi
done

TEST_DB_NAME=${PROCESS5_TEST_DB_NAME:-hacom_cloud_process5_release_test}
case "$TEST_DB_NAME" in
  *[!A-Za-z0-9_]*|'')
    echo "PROCESS5_TEST_DB_NAME must contain only letters, digits and underscores." >&2
    exit 2
    ;;
esac

POSTGRES_USER=${POSTGRES_USER:-hacom}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-hacom}
TEST_DATABASE_URL=${PROCESS5_TEST_DATABASE_URL:-"postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${TEST_DB_NAME}?sslmode=disable"}
TEST_MINIO_ENDPOINT=${TEST_MINIO_ENDPOINT:-${MINIO_ENDPOINT:-localhost:9000}}
GO_CACHE_DIR=${PROCESS5_GO_CACHE_DIR:-${TMPDIR:-/tmp}/hacom-cloud-process5-go-build}

compose() {
  docker compose -f deployments/docker-compose.yml "$@"
}

cleanup() {
  compose exec -T postgres \
    dropdb --if-exists -U "$POSTGRES_USER" "$TEST_DB_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "[1/9] Starting PostgreSQL and MinIO"
compose up -d postgres minio minio-init

ready=false
for _ in $(seq 1 30); do
  if compose exec -T postgres \
    pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  echo "PostgreSQL did not become ready within 30 seconds." >&2
  exit 1
fi

echo "[2/9] Creating a clean release database"
cleanup
compose exec -T postgres createdb -U "$POSTGRES_USER" "$TEST_DB_NAME"

echo "[3/9] Migrating up and verifying schema"
migrate -path migrations -database "$TEST_DATABASE_URL" up
compose exec -T postgres psql \
  -v ON_ERROR_STOP=1 \
  -U "$POSTGRES_USER" \
  -d "$TEST_DB_NAME" \
  -f /dev/stdin < scripts/verify-schema.sql

echo "[4/9] Proving down-one/up-one migration recovery"
migrate -path migrations -database "$TEST_DATABASE_URL" down 1
migrate -path migrations -database "$TEST_DATABASE_URL" up 1
compose exec -T postgres psql \
  -v ON_ERROR_STOP=1 \
  -U "$POSTGRES_USER" \
  -d "$TEST_DB_NAME" \
  -f /dev/stdin < scripts/verify-schema.sql

echo "[5/9] Checking Go formatting"
unformatted=$(gofmt -l ./cmd ./internal)
if [ -n "$unformatted" ]; then
  echo "The following Go files are not formatted:" >&2
  echo "$unformatted" >&2
  exit 1
fi

echo "[6/9] Running race, concurrency, reconciliation and regression tests"
GOCACHE="$GO_CACHE_DIR" \
TEST_DATABASE_URL="$TEST_DATABASE_URL" \
TEST_MINIO_ENDPOINT="$TEST_MINIO_ENDPOINT" \
go test -race -count=1 ./...

echo "[7/9] Reconciling the final database state"
compose exec -T postgres psql \
  -v ON_ERROR_STOP=1 \
  -U "$POSTGRES_USER" \
  -d "$TEST_DB_NAME" \
  -f /dev/stdin < scripts/reconcile-process5.sql

echo "[8/9] Running static analysis"
GOCACHE="$GO_CACHE_DIR" go vet ./...

echo "[9/9] Building API and Worker"
GOCACHE="$GO_CACHE_DIR" go build ./...

echo "Gate 5 PASSED: clean migration, rollback recovery, schema, race, integration, vet and build."
