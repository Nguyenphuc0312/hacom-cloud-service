#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RELEASE_ENV_FILE="${RELEASE_DIR}/.release.env"

if [ ! -f "${RELEASE_ENV_FILE}" ]; then
  echo "Missing release env file: ${RELEASE_ENV_FILE}" >&2
  exit 1
fi

cd "${RELEASE_DIR}"

set -a
source "${RELEASE_ENV_FILE}"
set +a

required_release_vars=(
  DEPLOY_ENV
  SERVICE_NAME
  SERVER_RUNTIME_ENV_FILE
  IMAGE_REF
  COMPOSE_FILE
  COMPOSE_PROJECT_NAME
  RUNTIME_SERVICE
)

for var in "${required_release_vars[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "Missing required app release configuration: ${var}" >&2
    exit 1
  fi
done

case "${DEPLOY_ENV}" in
  develop|production)
    ;;
  *)
    echo "Invalid DEPLOY_ENV: ${DEPLOY_ENV}" >&2
    exit 1
    ;;
esac

ln -sfn "${SERVER_RUNTIME_ENV_FILE}" .env.runtime
if [ ! -f "${SERVER_RUNTIME_ENV_FILE}" ]; then
  echo "Runtime env file does not exist on server: ${SERVER_RUNTIME_ENV_FILE}" >&2
  exit 1
fi

if [ ! -f "${COMPOSE_FILE}" ]; then
  echo "Compose file does not exist: ${COMPOSE_FILE}" >&2
  exit 1
fi

compose() {
  docker compose \
    --env-file "${SERVER_RUNTIME_ENV_FILE}" \
    -p "${COMPOSE_PROJECT_NAME}" \
    -f "${COMPOSE_FILE}" \
    "$@"
}

service_container_id() {
  compose ps -q "${RUNTIME_SERVICE}" | head -n 1
}

service_health_status() {
  local container_id
  container_id="$(service_container_id)"

  if [[ -z "${container_id}" ]]; then
    return 1
  fi

  docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "${container_id}"
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
    local status
    status="$(service_health_status || true)"
    if [[ "${status}" == "healthy" || "${status}" == "running" ]]; then
      echo "Health check passed on attempt ${i} with status=${status}"
      return 0
    fi

    if [[ -n "${HEALTHCHECK_URL:-}" ]] && compose exec -T "${RUNTIME_SERVICE}" sh -lc "wget -qO- '${HEALTHCHECK_URL}' >/dev/null"; then
      echo "Health check passed on attempt ${i} via ${HEALTHCHECK_URL}"
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

compose ps
