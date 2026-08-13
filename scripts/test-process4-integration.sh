#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

require_process4_file() {
  if [ ! -f "$1" ]; then
    echo "Process 4 production integration is blocked: $1 is not integrated." >&2
    exit 2
  fi
}

require_process4_file internal/repository/job_postgres.go
require_process4_file internal/filehash/service.go
require_process4_file internal/repository/file_lifecycle_postgres.go
require_process4_file internal/repository/upload_cleanup_postgres.go

TEST_DB_NAME=${PROCESS4_TEST_DB_NAME:-hacom_cloud_process4_integration_test}
POSTGRES_USER=${POSTGRES_USER:-hacom}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-hacom}
TEST_DATABASE_URL=${PROCESS4_TEST_DATABASE_URL:-"postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${TEST_DB_NAME}?sslmode=disable"}
TEST_MINIO_ENDPOINT=${TEST_MINIO_ENDPOINT:-${MINIO_ENDPOINT:-localhost:9000}}

cleanup() {
  docker compose -f deployments/docker-compose.yml exec -T postgres \
    dropdb --if-exists -U "$POSTGRES_USER" "$TEST_DB_NAME" >/dev/null
}
trap cleanup EXIT INT TERM

docker compose -f deployments/docker-compose.yml up -d postgres minio minio-init
docker compose -f deployments/docker-compose.yml exec -T postgres \
  dropdb --if-exists -U "$POSTGRES_USER" "$TEST_DB_NAME"
docker compose -f deployments/docker-compose.yml exec -T postgres \
  createdb -U "$POSTGRES_USER" "$TEST_DB_NAME"

migrate -path migrations -database "$TEST_DATABASE_URL" up
# Integration packages share this clean Gate 4 database. Keep the production
# Worker bootstrap test in its own go test process so it cannot claim jobs
# created by another package's repository tests.
PROCESS4_BOOTSTRAP_PACKAGE="$(go list ./cmd/worker)"
PROCESS4_OTHER_PACKAGES="$(go list ./... | grep -Fvx "$PROCESS4_BOOTSTRAP_PACKAGE")"
TEST_DATABASE_URL="$TEST_DATABASE_URL" \
TEST_MINIO_ENDPOINT="$TEST_MINIO_ENDPOINT" \
go test -race -count=1 $PROCESS4_OTHER_PACKAGES
TEST_DATABASE_URL="$TEST_DATABASE_URL" \
TEST_MINIO_ENDPOINT="$TEST_MINIO_ENDPOINT" \
go test -race -count=1 "$PROCESS4_BOOTSTRAP_PACKAGE"

echo "Process 4 PostgreSQL, MinIO, Worker lifecycle and regression tests passed."
