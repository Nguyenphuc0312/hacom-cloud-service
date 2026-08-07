# Process 5 — Worker recovery soak report

## Scope

The soak exercises the worker queue with a short test clock/interval and injected
MinIO/PostgreSQL failures. It verifies recovery, not production capacity; the
production retention period remains 24 hours and is never shortened in the
database.

## Scenario matrix

| Scenario | Expected result | Evidence |
|---|---|---|
| 100 permanent-delete jobs, 4 workers | Each job claimed once at a time; all complete | `jobs_claimed/completed` and reconciliation |
| MinIO unavailable for two attempts | `failed` + capped backoff, then completion | `purge_failed`, `job_retries` |
| Crash after MinIO delete | Retry sees missing object and finalizes once | one purge ledger/audit event; missing counter |
| Crash after DB finalize | Retry is a no-op; completion is idempotent | unchanged quota/ledger/audit |
| PostgreSQL restart with stale leases | New worker reclaims; old owner rejected | `stale_recovered`, job lock columns |
| Exhausted job | `dead`, lock cleared, no further claim | `dead_jobs` and read-only SQL |

## Acceptance measurements

- No duplicate active job for a `(drive_id, dedupe_key)` pair.
- For every permanent-delete operation, the quota delta, usage-ledger event and
  lifecycle audit event occur at most once.
- `used_bytes`, `trash_bytes` and ledger totals reconcile after every injected
  failure point.
- No orphan `cloud.jobs`, reservations, items or storage-object metadata remain.
- A missing MinIO binary is an idempotent success, not a retry storm.

Run the soak with the repository integration test command from the release
checklist and attach the test output plus `scripts/reconcile-process5.sql` output.
The local Gate 5 run passed the existing race/integration suite; a long-running
production-volume soak remains an operational follow-up, not a claim of capacity.

## Sign-off template

```text
SHA:
PostgreSQL/MinIO image:
Workers / jobs:
Injected failures:
Reconciliation result:
Metrics snapshot:
BLOCKER/MAJOR findings:
Reviewer / UTC:
```
