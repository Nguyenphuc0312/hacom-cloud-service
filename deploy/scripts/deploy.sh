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
if [ ! -r "${SERVER_RUNTIME_ENV_FILE}" ]; then
  echo "Runtime env file is not readable on server: ${SERVER_RUNTIME_ENV_FILE}" >&2
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

service_runtime_status() {
  local container_id
  container_id="$(service_container_id)"

  if [[ -z "${container_id}" ]]; then
    return 1
  fi

  docker inspect \
    --format '{{.State.Status}}' \
    "${container_id}"
}

service_health_status() {
  local container_id
  container_id="$(service_container_id)"

  if [[ -z "${container_id}" ]]; then
    return 1
  fi

  docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "${container_id}"
}

dump_diagnostics() {
  echo "== docker compose ps =="
  compose ps || true
  echo "== runtime logs =="
  compose logs --tail=200 "${RUNTIME_SERVICE}" || true
}

validate_runtime_service() {
  local services
  services="$(compose config --services)"

  if ! printf '%s\n' "${services}" | grep -Fx -- "${RUNTIME_SERVICE}" >/dev/null; then
    echo "Runtime service was not found in compose config: ${RUNTIME_SERVICE}" >&2
    echo "Available services:" >&2
    printf '%s\n' "${services}" >&2
    exit 1
  fi
}

probe_healthcheck_url() {
  if [[ -z "${HEALTHCHECK_URL:-}" ]]; then
    return 1
  fi

  if command -v curl >/dev/null 2>&1; then
    curl -fsS "${HEALTHCHECK_URL}" >/dev/null
    return 0
  fi

  wget -qO- "${HEALTHCHECK_URL}" >/dev/null
}

verify_health() {
  local attempts=30
  local sleep_seconds=5

  for ((i=1; i<=attempts; i++)); do
    if probe_healthcheck_url; then
      echo "Health check passed on attempt ${i} via ${HEALTHCHECK_URL}"
      return 0
    fi

    local runtime_status health_status
    runtime_status="$(service_runtime_status || true)"
    health_status="$(service_health_status || true)"

    case "${health_status}" in
      healthy)
        echo "Health check passed on attempt ${i} with docker health status=${health_status}"
        return 0
        ;;
      none)
        if [[ "${runtime_status}" == "running" ]]; then
          echo "Health check passed on attempt ${i} with runtime status=${runtime_status}"
          return 0
        fi
        ;;
      starting|'')
        ;;
      unhealthy)
        echo "Runtime container reported unhealthy before ${HEALTHCHECK_URL:-health probe} became ready." >&2
        return 1
        ;;
      *)
        echo "Runtime container reported unexpected health status=${health_status}; waiting for readiness." >&2
        ;;
    esac

    if [[ -n "${runtime_status}" && "${runtime_status}" != "running" ]]; then
      echo "Runtime container is no longer running while waiting for readiness: status=${runtime_status}" >&2
      return 1
    fi

    sleep "${sleep_seconds}"
  done

  echo "Runtime healthcheck timed out after $((attempts * sleep_seconds))s" >&2
  return 1
}

trap 'echo "Deploy failed"; dump_diagnostics' ERR

compose config -q
validate_runtime_service
docker pull "${IMAGE_REF}"
compose up -d --remove-orphans --force-recreate "${RUNTIME_SERVICE}"
verify_health

compose ps
