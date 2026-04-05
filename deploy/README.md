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
