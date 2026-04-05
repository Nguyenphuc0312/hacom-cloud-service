# chat-admin-panel deploy bundle

This folder contains release-bundle artifacts used by CI/CD for server-test and production deploys.

## Compose files

- deploy/compose/server-test.yml
- deploy/compose/production.yml

## Scripts

- deploy/scripts/deploy.sh
- deploy/scripts/rollback.sh

## Runtime routing

chat-admin-panel is exposed through edge route /admin/ and calls APIs via /api/v1/\* on the same host.

## Phase 4 write rollout notes (server-test)

- Build-time flag `VITE_ADMIN_WRITE_ACTIONS_ENABLED` must be explicitly set to `true` only when backend write paths are verified.
- Keep this flag aligned with backend runtime toggle `ADMIN_WRITE_ENABLED` in chat-admin-service to avoid UI/backend mismatch.
- Recommended preflight before enabling:
  - rollback drill for chat-admin-service, chat-admin-panel, and chat-auth-service completed
  - write smoke tests passed: lock/unlock/revoke sessions and HR create/update/delete
  - audit logs show actor, target entity, requestId, and action result
