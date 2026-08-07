# Process 5 — Worker operations and recovery runbook

This runbook covers the `permanent_delete` worker and the PostgreSQL-backed job
queue. It is safe to use during a release demo and does not expose object keys,
signed URLs, request reasons or credentials in logs/reports.

## Health and evidence first

1. Capture the release SHA, incident/request ID and UTC time.
2. Check `GET /health/ready` and `GET /metrics` for the API/worker pair.
3. Check PostgreSQL and MinIO container health without printing environment
   secrets:

   ```bash
   docker compose -f deployments/docker-compose.yml ps
   curl -fsS "$CLOUD_BASE/health/ready"
   curl -fsS "$WORKER_METRICS_URL/metrics" > worker-metrics.txt
   ```

4. Run the read-only reconciliation script before changing anything:

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/reconcile-process5.sql
   ```

The script must report zero quota/ledger mismatches, orphan rows and duplicate
active jobs. Never edit `status`, `attempts`, quota, ledger or audit rows by hand.

## Failure injection and crash points

The permanent-delete sequence deliberately has no open database transaction while
calling MinIO:

```text
claim lease → read target (short DB tx) → Stat/Delete MinIO
         → finalize metadata + quota + ledger + audit (short DB tx) → complete job
```

| Injected failure | Expected state | Recovery action |
|---|---|---|
| MinIO unavailable or timeout | Job `failed`; quota/ledger/audit unchanged | Restore MinIO, wait for `run_after`, verify retry counter |
| PostgreSQL outage before target read | Job remains leased until timeout, then stale recovery | Restart/restore DB, allow another worker to reclaim |
| Crash after object delete, before finalize | Object absent; job is `failed`/stale; metadata still pending | Reclaim job; missing object is success and finalize runs once |
| Crash after finalize, before job complete | Metadata/quota/ledger/audit finalized; job may retry | Handler sees `AlreadyFinalized`; complete is idempotent |
| Worker process/container loss | `processing` lock becomes stale | Let `LockTimeout` elapse; a new worker claims with `SKIP LOCKED` |

The handler never trusts an object key from job payload. It reloads the canonical
target from PostgreSQL and treats `storage.ErrObjectNotFound` as successful purge
with a missing-object counter and audit/reconciliation evidence.

## Stale locks and dead jobs

- A stale `processing` row is reclaimed only after `LockTimeout` and only by a
  worker holding its row lock. The old worker cannot complete or fail it.
- A stale row that has exhausted `max_attempts` is moved to `dead` and its lock is
  cleared. The dead-job counter is monotonic.
- `failed` rows retry at `run_after` with capped exponential backoff. Do not
  manually set `run_after` in production.
- For a `dead` job, fix the dependency first, preserve the row as evidence, then
  create a new approved job through the domain/recovery flow with the same logical
  operation. Do not reset attempts or replay quota SQL manually.

Useful read-only inspection:

```sql
SELECT id, job_type, status, attempts, max_attempts, run_after,
       locked_by, locked_at, last_error
FROM cloud.jobs
WHERE status IN ('processing', 'failed', 'dead')
ORDER BY created_at ASC;
```

## Metrics, alerts and dashboard

The worker metrics endpoint exports only bounded, unlabeled counters:

- `hacom_cloud_trash_purge_scanned_total`, `...purge_completed_total`,
  `...purge_missing_object_total`, `...purge_failed_total`;
- `hacom_cloud_worker_jobs_claimed_total`, `...jobs_completed_total`,
  `...jobs_failed_total`, `...job_retries_total`, `...stale_recovered_total`,
  `...dead_jobs_total`.

Prometheus rules are versioned at
`deployments/monitoring/process5-worker-alerts.yml`. Suggested dashboard panels:

```promql
rate(hacom_cloud_worker_jobs_completed_total[5m])
rate(hacom_cloud_worker_job_retries_total[5m])
increase(hacom_cloud_worker_dead_jobs_total[15m])
increase(hacom_cloud_worker_stale_recovered_total[15m])
increase(hacom_cloud_trash_purge_missing_object_total[15m])
```

Alert on any new dead job, sustained purge failures, a retry storm, or an unusual
missing-object burst. User IDs, item IDs, object keys and request IDs are never
metric labels.

## Recovery verification

After dependencies recover or a worker is restarted:

1. Confirm the worker can claim and complete a canary job in a non-production
   drive.
2. Confirm the retry/stale counters increased only for the injected failure.
3. Run `scripts/reconcile-process5.sql` and attach its output to the incident.
4. Check that each permanent-delete operation has at most one purge ledger delta
   and one lifecycle audit event; a retry must not change the quota twice.
5. Keep the old dead job and metrics snapshot as release evidence.

## Escalation and rollback

Drain the worker and roll back API and worker to the same tested SHA when a new
failure continues after dependency recovery. Do not delete MinIO objects or audit
rows as part of an application rollback. Follow
`docs/process5-deployment-rollback.md` and re-run reconciliation before resuming
traffic.
