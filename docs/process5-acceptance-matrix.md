# Process 5 — Gate 5 acceptance matrix

Date: 2026-08-07  
Scope: Phase 2 Gates 1–3 Cloud + My Documents frontend + Process 4 worker  
Decision: **PASS for the owned local release candidate**

## Source revisions

| Component | Branch | Tested revision |
|---|---|---|
| Cloud backend | `integration/phase-2-gates-1-3` | `d0f0d650` |
| Cloud frontend | `integration/phase-2-gates-1-3-frontend` | `af91a644` |

The revisions above are the input SHAs for this report. Documentation and test-only
changes made after the run must produce a new release report rather than silently
reusing these results.

## Acceptance matrix

| Area | Command/evidence | Result |
|---|---|---|
| Migration baseline | Docker `migrate`: 11 migrations `up`; clean `down 1`; `up 1` | PASS |
| Schema safety | `scripts/verify-schema.sql` on the release database | PASS |
| Backend regression | `go test -p 1 -race -count=1 ./...` in `golang:1.25` | PASS |
| Static/build | `go vet ./...` and `go build ./...` | PASS |
| Trash/restore/purge | Gate 2 repository, worker and reconciliation tests | PASS |
| Search/quota/admin | Gate 3 repository, API, audit and idempotency tests | PASS |
| Frontend readiness | `npm run ci:readiness` | PASS: 131 files, 1,095 passed, 7 skipped |
| Frontend performance | `npm run test:e2e:perf` | PASS: 1 smoke |
| Browser E2E | `npm run test:e2e` | PASS: 2 smoke tests |
| Postman release | Process 5 collection in Docker Newman | PASS: 14 requests, 12 assertions |
| Local runtime | Web, Cloud API/proxy, Chat API/Auth and MinIO returned HTTP 200 | PASS |

## Regression boundary

The local Gate 5 pass covers Cloud-owned behavior and the authorized frontend.
Production Auth/JWKS issuance, Admin Service deployment, notification delivery,
gateway policy and live cross-service E2E remain external handoffs documented in
`docs/HACOM-DX-BACKEND-CONTRACT-NEGOTIATION.md`. They are not simulated as a pass.

## Findings

- BLOCKER: 0
- MAJOR: 0
- MINOR: 0
- Existing frontend lint baseline: 52 warnings, 0 errors. These warnings are
  recorded as baseline and are not introduced by the smoke E2E configuration.
- Host Newman cannot PUT a Docker-signed MinIO URL on every Windows DNS setup;
  the release command runs Newman in Docker with `host.docker.internal`.

## Reproduction

```powershell
# Backend: use a clean PostgreSQL database and the Docker Go image.
docker compose -f deployments/docker-compose.yml up -d postgres minio minio-init
docker run --rm --add-host host.docker.internal:host-gateway `
  -v "${PWD}\migrations:/migrations:ro" migrate/migrate:latest `
  -path /migrations `
  -database "postgres://hacom:hacom@host.docker.internal:5432/<test_db>?sslmode=disable" up

# Frontend and browser E2E.
npm run ci:readiness
npm run test:e2e
npm run test:e2e:perf
```

Never run the release test against the production `hacom_cloud` database. The
release fixture database must be dropped after the run.
