# Permanent-delete worker and recovery runbook

## Runtime contract

The Trash scanner selects only `items.status = 'trashed'` rows whose
`purge_after <= NOW()`, ordered by deadline and ID, and processes at most
`WORKER_TRASH_BATCH_SIZE` rows per scan. `TRASH_RETENTION` is validated as
exactly `24h`; changing it is rejected at startup.

Logical purge is a short PostgreSQL transaction. It locks Item and quota in
the shared lifecycle order, releases quota once, appends ledger and audit
evidence, marks a file object `delete_pending`, enqueues one
`permanent_delete` job, and removes Item metadata. Text and link items have no
object job.

The worker reads and validates the job in PostgreSQL, closes that query, calls
MinIO, and only then opens a short finalize transaction. No database
transaction is held over MinIO I/O.

## Crash and retry matrix

| Failure point | Durable state | Recovery |
|---|---|---|
| Before logical purge commits | Item remains in Trash; quota unchanged | Next scanner pass retries |
| After logical purge commits, before claim | Item removed; quota/ledger/audit/job committed | Any worker claims the pending job |
| Before MinIO delete | Object is present; job lease becomes stale | Framework stale-lock recovery retries |
| After MinIO delete, before DB finalize | Object is absent; object metadata is `delete_pending` | Retry treats missing object as success and finalizes |
| After DB finalize, before job complete | Object metadata is `deleted`; audit exists once | Retry observes finalized target; job completes idempotently |
| Attempts exhausted | Job is `dead` and object remains reconcilable | Diagnose, repair dependency, then explicitly requeue |

MinIO `NoSuchKey` is a successful deletion outcome. The completion audit stores
`object_missing=true`; it never stores a bucket, object key, or presigned URL.

## Configuration and metrics

- `WORKER_TRASH_SCAN_INTERVAL` (default `30s`)
- `WORKER_TRASH_BATCH_SIZE` (default `100`, maximum `1000`)
- `WORKER_METRICS_ADDR` (default `:9091`)
- Existing `WORKER_MAX_ATTEMPTS`, backoff, timeout, and stale-lock settings also
  apply to `permanent_delete`.

Read-only metrics are exposed on the worker metrics address:

- `hacom_cloud_trash_purge_scanned_total`
- `hacom_cloud_trash_purge_completed_total`
- `hacom_cloud_trash_purge_missing_object_total`
- `hacom_cloud_trash_purge_failed_total`
- `hacom_cloud_worker_dead_jobs_total`

## Recovery procedure for a dead job

1. Find dead permanent-delete jobs without printing payload or object key.

   ```sql
   SELECT id, drive_id, storage_object_id, attempts, last_error, updated_at
   FROM cloud.jobs
   WHERE job_type = 'permanent_delete' AND status = 'dead'
   ORDER BY updated_at;
   ```

2. Verify the referenced object metadata is still `delete_pending`. Investigate
   MinIO connectivity/credentials and the recorded `last_error`.
3. After the dependency is healthy, requeue only the reviewed job:

   ```sql
   BEGIN;
   SELECT id FROM cloud.jobs WHERE id = :'job_id' FOR UPDATE;
   UPDATE cloud.jobs
   SET status = 'failed', attempts = 0, run_after = NOW(),
       locked_by = NULL, locked_at = NULL, last_error = NULL
   WHERE id = :'job_id'
     AND job_type = 'permanent_delete'
     AND status = 'dead';
   COMMIT;
   ```

4. Confirm the job reaches `completed`, object metadata reaches `deleted`, and
   run `scripts/reconcile-trash-lifecycle.sql`. Never manually decrement quota:
   quota was released by the earlier logical-purge transaction.
