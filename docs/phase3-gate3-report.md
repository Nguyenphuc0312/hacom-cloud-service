# Gate 3 QA report — Cloud scope and external handoff

Date: 05/08/2026

## Status by ownership boundary

| Gate criterion | Evidence in this repository | Status |
|---|---|---|
| Active/Trash search, filters and stable cursor | PostgreSQL repository integration suite; cursor fingerprint contract | PASS |
| Search performance | 105,000-item benchmark: active 6.499 ms, Trash 4.398 ms, cursor 0.248 ms; 2 s safety budget | PASS |
| One pending quota request | concurrent create tests and unique partial index | PASS |
| Idempotent approve/reject transaction | row lock, operation ID and retry/conflict integration tests | PASS |
| Quota and audit atomicity | PostgreSQL transaction assertions and reconciliation query | PASS |
| Audit trace and sensitive-data controls | common audit writer and bounded metrics tests | PASS |
| Audit append-only enforcement | migrations 000010/000011 and mutation/GUC-bypass tests | PASS |
| Cloud API/Worker build and migration rollback | `make test-gate3` | PASS |
| Chat Web user UI | separate authorized frontend worktree/branch and its readiness gate | IN PROGRESS |
| Production Auth permission refresh | requires Hacom Holding DX Auth backend | DEFERRED |
| Admin service token and `cloud.quota.review` provisioning | requires Auth/Admin backend owners | DEFERRED |
| Admin review panel live integration | requires Admin backend contract; frontend may proceed after acceptance | DEFERRED |
| Notification delivery from Cloud outbox | requires Notification backend consumer | DEFERRED |
| Live cross-service HTTP E2E | requires Auth/Admin/Infrastructure integration environment | DEFERRED |

## What `make test-gate3` proves

The gate creates an isolated PostgreSQL database, applies and verifies all Cloud
migrations, runs Search/Trash/quota/audit acceptance tests under the race
detector, reconciles terminal quota requests against audit evidence, proves the
audit-maintenance migration can roll back and recover, then vets/builds the
Cloud API and Worker. It does not read, build or change any Hacom Holding DX
backend repository.

The Postman collection remains a machine-readable handoff artifact. Merely
parsing that collection is not a live E2E pass.

## Security boundary

- Cloud rejects a missing/invalid service credential and requires the exact
  review scope defined by the frozen contract.
- The caller cannot provide the audited actor through request JSON.
- An exact retry returns `applied=false`; a conflicting operation cannot update
  quota or append a second terminal audit event.
- Review notes, file content, object keys, access tokens and presigned URLs are
  excluded from audit/metrics evidence.
- External Auth must remain the account/permission authority. Cloud must not
  add an HS256 compatibility shortcut or duplicate Auth state locally.

## External work not claimed as complete

Production identity, refreshed admin permission, service-token issuance,
gateway routing and notification delivery are backend responsibilities of the
Hacom Holding DX team. The required changes and acceptance evidence are tracked
in `docs/HACOM-DX-BACKEND-CONTRACT-NEGOTIATION.md`.

Gate 3 result: **PASS for the Cloud-owned code/data gate; frontend remains in
progress; external backend and live cross-service criteria remain DEFERRED.**
