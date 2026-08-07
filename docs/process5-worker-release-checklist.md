# Process 5 — Worker release checklist

## Required checks

- [ ] Backend and worker use the same release SHA and migration version.
- [ ] `go test -race -count=1 ./internal/worker/... ./cmd/worker/...` passes
      against PostgreSQL/MinIO integration services.
- [ ] `go vet ./...` and `go build ./...` pass in the pinned Go container.
- [ ] Failure injection covers MinIO outage, PostgreSQL outage, crash after
      object delete and crash after DB finalize.
- [ ] Stale `processing` lock is reclaimed by a second worker; the old owner is
      rejected by `Complete` and `Fail`.
- [ ] Exhausted stale jobs become `dead`, release the lock and are not claimed.
- [ ] Retry/backoff is capped and does not duplicate quota, usage-ledger or audit
      changes.
- [ ] Missing MinIO object completes idempotently and is visible in metrics and
      reconciliation evidence.
- [ ] `/metrics` exports bounded worker counters and Prometheus rules are reviewed
      in `deployments/monitoring/process5-worker-alerts.yml`.
- [ ] Reconciliation returns zero mismatches, orphan rows and duplicate active
      jobs before and after the soak.

## Release evidence

Record the backend SHA, test container image, migration database name, test
timestamp and the final metrics snapshot in the release report. Never attach
presigned URLs, credentials, user IDs or sensitive file metadata.

## Go/no-go

Go only when every required check is checked and there are no BLOCKER/MAJOR
findings. Any dead job, reconciliation mismatch or duplicate ledger/audit event
is a no-go until the dependency is fixed and the recovery runbook is completed.
