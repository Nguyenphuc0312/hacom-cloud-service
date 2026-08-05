#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DEFAULT_WORKSPACE_ROOT=$(CDPATH= cd -- "$ROOT_DIR/.." && pwd)
if [ -d "$DEFAULT_WORKSPACE_ROOT/hacom-holding-dx/chat-web-client" ]; then
  DEFAULT_WEB_CLIENT_DIR="$DEFAULT_WORKSPACE_ROOT/hacom-holding-dx/chat-web-client"
else
  DEFAULT_WEB_CLIENT_DIR="$DEFAULT_WORKSPACE_ROOT/chat-web-client"
fi
WEB_CLIENT_DIR=${PHASE2_GATE1_WEB_CLIENT_DIR:-$DEFAULT_WEB_CLIENT_DIR}

for command in docker migrate go node npm git; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Gate 1 Cloud/Web is blocked: missing command '$command'." >&2
    exit 2
  fi
done

if [ ! -f "$WEB_CLIENT_DIR/package.json" ]; then
  echo "Gate 1 Cloud/Web is blocked: chat-web-client is missing at $WEB_CLIENT_DIR." >&2
  exit 2
fi

echo "Cloud revision: $(git -C "$ROOT_DIR" rev-parse HEAD)"
echo "Web revision: $(git -C "$WEB_CLIENT_DIR" rev-parse HEAD)"

echo "[1/4] Cloud Phase 1 regression, race, vet and build"
make -C "$ROOT_DIR" test-release-process5

echo "[2/4] Phase 2 migration 000005 up/down/backfill"
make -C "$ROOT_DIR" test-migration-phase2

echo "[3/4] Cloud Auth/OpenAPI/JWKS static contract"
make -C "$ROOT_DIR" test-gate1-person4-static

echo "[4/4] Authorized chat-web-client production readiness"
npm --prefix "$WEB_CLIENT_DIR" run ci:readiness

echo "Gate 1 Cloud/Web scope PASSED."
echo "External Auth/JWKS, gateway runtime and cross-service E2E remain DEFERRED"
echo "to Hacom Holding DX backend owners; see docs/HACOM-DX-BACKEND-CONTRACT-NEGOTIATION.md."
