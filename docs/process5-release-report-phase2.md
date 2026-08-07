# Hacom Cloud — Process 5 release report (Phase 2)

Date: 2026-08-07  
Release status: **PASS — local release candidate**

## Release SHAs

- Backend: `integration/phase-2-gates-1-3 @ d0f0d650`
- Frontend: `integration/phase-2-gates-1-3-frontend @ af91a644`

These SHAs identify the code tested. The release documentation commit is tracked
separately by Git and must be recorded when this document is committed.

## What was verified

1. PostgreSQL migrations 1–11 run on an empty database, roll back one migration,
   and reapply it without manual data edits.
2. Backend race/integration tests pass against PostgreSQL and MinIO; `go vet` and
   `go build` pass in the Go 1.25 container.
3. Trash 24-hour retention, restore/purge races, quota ledger invariants, search
   cursor binding, quota request idempotency and audit boundaries pass.
4. Frontend typecheck, lint (0 errors), production build, unit suite, performance
   benchmark and static production gate pass.
5. Browser smoke E2E covers `/chat/my-documents` and the `/cloud-api/health/ready`
   proxy. The performance smoke is below the 3-second local budget.
6. The Process 5 Postman collection passes in a Docker Newman runner without
   printing presigned URLs.

## Gate decision

Gate 5 is **PASS for the Cloud-owned local release candidate**. No BLOCKER or
MAJOR finding remains in the tested scope.

This is not a production deployment approval. Production Auth/JWKS authority,
Admin Service permission refresh, notification transport, gateway hardening and
live cross-service E2E require the owning Hacom DX services and are explicitly
listed as deferred handoffs.

## Artifacts

- Acceptance matrix: [`process5-acceptance-matrix.md`](process5-acceptance-matrix.md)
- Demo: [`process5-demo-script-phase2.md`](process5-demo-script-phase2.md)
- Slides: [`process5-slide-outline-phase2.md`](process5-slide-outline-phase2.md)
- Deployment/rollback: [`process5-deployment-rollback.md`](process5-deployment-rollback.md)
- API/OpenAPI/Postman index: [`process5-api-openapi-postman.md`](process5-api-openapi-postman.md)
