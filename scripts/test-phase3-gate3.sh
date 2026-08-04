#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

for command in docker migrate go node npm; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Phase 3 Gate is blocked: missing command '$command'." >&2
    exit 2
  fi
done

TEST_DB_NAME=${PHASE3_GATE3_TEST_DB_NAME:-hacom_cloud_gate3_test_$$}
case "$TEST_DB_NAME" in *[!A-Za-z0-9_]*|'') echo "Invalid Phase 3 test database name" >&2; exit 2;; esac
POSTGRES_USER=${POSTGRES_USER:-hacom}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-hacom}
TEST_DATABASE_URL=${PHASE3_GATE3_TEST_DATABASE_URL:-"postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${TEST_DB_NAME}?sslmode=disable"}
WORKSPACE_ROOT=${PHASE3_WORKSPACE_ROOT:-"$ROOT_DIR/.."}
SHARED_TYPES_DIR=${PHASE3_SHARED_TYPES_DIR:-"$WORKSPACE_ROOT/chat-shared-types"}
AUTH_SERVICE_DIR=${PHASE3_AUTH_SERVICE_DIR:-"$WORKSPACE_ROOT/chat-auth-service"}
ADMIN_SERVICE_DIR=${PHASE3_ADMIN_SERVICE_DIR:-"$WORKSPACE_ROOT/chat-admin-service"}
ADMIN_PANEL_DIR=${PHASE3_ADMIN_PANEL_DIR:-"$WORKSPACE_ROOT/chat-admin-panel"}

for directory in "$SHARED_TYPES_DIR" "$AUTH_SERVICE_DIR" "$ADMIN_SERVICE_DIR" "$ADMIN_PANEL_DIR"; do
  if [ ! -f "$directory/package.json" ]; then echo "Phase 3 repository missing: $directory" >&2; exit 2; fi
done

compose() { docker compose -f deployments/docker-compose.yml "$@"; }
cleanup() { compose exec -T postgres dropdb --if-exists -U "$POSTGRES_USER" "$TEST_DB_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

echo "[1/8] Starting isolated PostgreSQL"
compose up -d postgres
cleanup
compose exec -T postgres createdb -U "$POSTGRES_USER" "$TEST_DB_NAME"

echo "[2/8] Applying all migrations"
migrate -path migrations -database "$TEST_DATABASE_URL" up

echo "[3/8] Running Search, Trash, quota and security acceptance"
TEST_DATABASE_URL="$TEST_DATABASE_URL" GATE3_PRESERVE_EVIDENCE=true go test -race -count=1 -run 'Test(Phase3|QuotaRequest|TrashPostgres|AuditLog)' ./internal/repository
go test -count=1 ./internal/audit ./internal/observability ./internal/cloudapi ./internal/auth ./tests/contract

echo "[4/8] Reconciling terminal request and audit evidence"
FINDINGS=$(compose exec -T postgres psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$TEST_DB_NAME" -f /dev/stdin < scripts/reconcile-phase3-gate3.sql)
if [ -n "$FINDINGS" ]; then echo "$FINDINGS" >&2; exit 1; fi

echo "[5/8] Proving audit guard rollback and recovery"
migrate -path migrations -database "$TEST_DATABASE_URL" down 1
migrate -path migrations -database "$TEST_DATABASE_URL" up 1

echo "[6/8] Vetting and building Cloud API"
go vet ./...
go build ./cmd/api ./cmd/worker

echo "[7/8] Building shared contract and all Admin consumers"
npm --prefix "$SHARED_TYPES_DIR" run contract:check
npm --prefix "$AUTH_SERVICE_DIR" run typecheck
npm --prefix "$ADMIN_SERVICE_DIR" run build
npm --prefix "$ADMIN_PANEL_DIR" run build

echo "[8/8] Validating Postman collection JSON"
node -e "JSON.parse(require('fs').readFileSync('tests/postman/Hacom-Cloud-Phase-3-Gate-3.postman_collection.json','utf8'))"

echo "Phase 3 Gate 3 PASSED. Run 'make test-postman-phase3' against live Auth/Admin/Cloud services for HTTP E2E."
