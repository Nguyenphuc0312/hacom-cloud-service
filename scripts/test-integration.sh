#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

TEST_DB_NAME=${INTEGRATION_TEST_DB_NAME:-hacom_cloud_integration_test}
POSTGRES_USER=${POSTGRES_USER:-hacom}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-hacom}
TEST_DATABASE_URL=${TEST_DATABASE_URL:-"postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${TEST_DB_NAME}?sslmode=disable"}

cleanup() {
  docker compose -f deployments/docker-compose.yml exec -T postgres \
    dropdb --if-exists -U "$POSTGRES_USER" "$TEST_DB_NAME" >/dev/null
}
trap cleanup EXIT INT TERM

docker compose -f deployments/docker-compose.yml exec -T postgres \
  dropdb --if-exists -U "$POSTGRES_USER" "$TEST_DB_NAME"
docker compose -f deployments/docker-compose.yml exec -T postgres \
  createdb -U "$POSTGRES_USER" "$TEST_DB_NAME"

migrate -path migrations -database "$TEST_DATABASE_URL" up
TEST_DATABASE_URL="$TEST_DATABASE_URL" go test -race ./internal/repository -count=1 -v
