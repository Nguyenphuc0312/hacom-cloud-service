#!/usr/bin/env bash
# Standardized rollback script template
# Usage: ./rollback.sh
#
# Rolls back to the previous release by following the "previous" symlink
# and re-running the deploy script.
#
# Requires .release.env in the previous release directory.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${APP_ROOT}"

if [[ ! -L previous ]]; then
  echo "No previous release symlink found" >&2
  exit 1
fi

PREVIOUS_DIR="$(readlink -f previous)"
if [[ ! -d "${PREVIOUS_DIR}" ]]; then
  echo "Previous release directory does not exist: ${PREVIOUS_DIR}" >&2
  exit 1
fi

echo "Rolling back to: ${PREVIOUS_DIR}"
cd "${PREVIOUS_DIR}"
./deploy/scripts/deploy.sh
