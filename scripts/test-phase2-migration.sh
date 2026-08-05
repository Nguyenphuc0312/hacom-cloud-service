#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

for command in docker migrate; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Phase 2 migration test is blocked: missing command '$command'." >&2
    exit 2
  fi
done

TEST_DB_NAME=${PHASE2_MIGRATION_TEST_DB_NAME:-hacom_cloud_phase2_migration_test}
case "$TEST_DB_NAME" in
  *[!A-Za-z0-9_]*|'')
    echo "PHASE2_MIGRATION_TEST_DB_NAME must contain only letters, digits and underscores." >&2
    exit 2
    ;;
esac

POSTGRES_USER=${POSTGRES_USER:-hacom}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-hacom}
TEST_DATABASE_URL=${PHASE2_MIGRATION_TEST_DATABASE_URL:-"postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${TEST_DB_NAME}?sslmode=disable"}

compose() {
  docker compose -f deployments/docker-compose.yml "$@"
}

psql_file() {
  compose exec -T postgres psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d "$TEST_DB_NAME" \
    -f /dev/stdin < "$1"
}

cleanup() {
  compose exec -T postgres \
    dropdb --if-exists -U "$POSTGRES_USER" "$TEST_DB_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "[1/11] Starting PostgreSQL"
compose up -d postgres

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

echo "[2/11] Testing all Phase 2 migrations on an empty database"
cleanup
compose exec -T postgres createdb -U "$POSTGRES_USER" "$TEST_DB_NAME"
migrate -path migrations -database "$TEST_DATABASE_URL" up
psql_file scripts/verify-schema.sql

echo "[3/11] Recreating a Phase 1 database"
cleanup
compose exec -T postgres createdb -U "$POSTGRES_USER" "$TEST_DB_NAME"
migrate -path migrations -database "$TEST_DATABASE_URL" up 4
psql_file tests/sql/phase2-backfill-fixture.sql

echo "[4/11] Upgrading populated Phase 1 data and checking backfill/invariants"
migrate -path migrations -database "$TEST_DATABASE_URL" up 1
psql_file tests/sql/phase2-migration-assertions.sql

echo "[5/11] Rolling migration 000005 down"
migrate -path migrations -database "$TEST_DATABASE_URL" down 1
psql_file tests/sql/phase2-down-assertions.sql

echo "[6/11] Reapplying migration 000005 after rollback"
migrate -path migrations -database "$TEST_DATABASE_URL" up 1
psql_file tests/sql/phase2-migration-assertions.sql

echo "[7/11] Applying migration 000006"
migrate -path migrations -database "$TEST_DATABASE_URL" up 1

echo "[8/11] Running the migration 000001..000006 schema contract"
psql_file scripts/verify-trash-gate2-schema.sql

echo "[9/11] Proving 000006 data rollback/reapply reconciliation"
psql_file tests/sql/trash-lifecycle-rollback-fixture.sql
migrate -path migrations -database "$TEST_DATABASE_URL" down 1
migrate -path migrations -database "$TEST_DATABASE_URL" up 1
psql_file tests/sql/trash-lifecycle-rollback-assertions.sql

echo "[10/11] Recreating corrupt Phase 1 data for fail-safe validation"
cleanup
compose exec -T postgres createdb -U "$POSTGRES_USER" "$TEST_DB_NAME"
migrate -path migrations -database "$TEST_DATABASE_URL" up 4
psql_file tests/sql/phase2-invalid-backfill-fixture.sql

echo "[11/11] Proving unsafe backfill is rejected atomically"
if migrate -path migrations -database "$TEST_DATABASE_URL" up 1; then
  echo "Migration 000005 incorrectly accepted trash_bytes greater than used_bytes." >&2
  exit 1
fi
psql_file tests/sql/phase2-down-assertions.sql

echo "Phase 2 migration PASSED: empty, Phase 1 upgrade, safe backfill, invariants, rejection and down/up."
