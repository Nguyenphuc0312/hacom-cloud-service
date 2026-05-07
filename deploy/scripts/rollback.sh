#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${APP_ROOT}"

if [[ ! -e previous ]]; then
  echo "No previous release snapshot found" >&2
  exit 1
fi

cd "$(readlink -f previous)"
./deploy/scripts/deploy.sh
