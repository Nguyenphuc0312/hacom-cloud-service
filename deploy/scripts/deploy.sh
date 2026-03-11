#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

test -f .release.env

set -a
. ./.release.env
set +a

: "${SERVER_ENV_PATH:?SERVER_ENV_PATH is required}"

ln -sfn "${SERVER_ENV_PATH}" .env.runtime
test -f .env.runtime

set -a
. ./.env.runtime
set +a

: "${COMPOSE_FILE:?COMPOSE_FILE is required}"
: "${RUNTIME_SERVICE:?RUNTIME_SERVICE is required}"
: "${HEALTHCHECK_URL:=http://127.0.0.1/healthz}"
: "${IMAGE_REF:?IMAGE_REF is required}"

APP_ROOT="$(cd "${ROOT_DIR}/../.." && pwd)"
CURRENT_LINK="${APP_ROOT}/current"
PREVIOUS_LINK="${APP_ROOT}/previous"

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

dump_diagnostics() {
  echo "== docker compose ps =="
  compose ps || true
  echo "== runtime logs =="
  compose logs --tail=200 "${RUNTIME_SERVICE}" || true
}

verify_health() {
  local attempts=30
  local sleep_seconds=5

  for ((i=1; i<=attempts; i++)); do
    if compose exec -T "${RUNTIME_SERVICE}" sh -lc "wget -qO- '${HEALTHCHECK_URL}' >/dev/null"; then
      echo "Health check passed on attempt ${i}"
      return 0
    fi
    sleep "${sleep_seconds}"
  done

  return 1
}

trap 'echo "Deploy failed"; dump_diagnostics' ERR

compose config -q
docker pull "${IMAGE_REF}"
compose up -d --no-deps --force-recreate "${RUNTIME_SERVICE}"
verify_health

if [[ -L "${CURRENT_LINK}" ]]; then
  rm -f "${PREVIOUS_LINK}"
  ln -sfn "$(readlink -f "${CURRENT_LINK}")" "${PREVIOUS_LINK}"
fi
ln -sfn "${ROOT_DIR}" "${CURRENT_LINK}"

compose ps
