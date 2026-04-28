#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "${REPO_ROOT}/.." && pwd)"
FALLBACK="${WORKSPACE_ROOT}/ops/fallback-ssh/deploy-one.sh"

if [[ ! -f "${FALLBACK}" ]]; then
  echo "Fallback deploy script not found: ${FALLBACK}" >&2
  echo "Run this from a checkout inside D:/Workspace/hacom_holding_dx/projects or call ops/fallback-ssh/deploy-one.sh directly." >&2
  exit 1
fi

exec bash "${FALLBACK}" chat-admin-panel "$@"
