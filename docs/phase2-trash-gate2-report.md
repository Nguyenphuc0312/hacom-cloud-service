# Phase 2 Trash — Gate 2 acceptance report

## Acceptance result

Gate 2 covers move, restore, immediate delete, automatic purge, owned file
preview in Trash, text/link/file items, missing objects, crash recovery, retry,
and the restore-vs-purge and delete-vs-preview races. Tests use injected clocks
or database timestamps; no test waits 24 hours.

Verified on 2026-08-04 against PostgreSQL 16 and MinIO with migrations
`000001` through `000006`: the full `go test -race -count=1 ./...` suite,
`go vet ./...`, API/Worker builds, and the silent Newman Trash collection all
passed.

| State or event | Item metadata | Object metadata | `used_bytes` | `trash_bytes` | Job |
|---|---|---|---:|---:|---|
| Ready | present/ready | ready for file | billable | 0 | none |
| Move to Trash | present/trashed | unchanged | unchanged | +billable | none |
| Restore before deadline | present/ready | unchanged | unchanged | -billable | none |
| Immediate delete text/link | removed | n/a | -billable once | -billable if trashed | none |
| Logical delete file | removed | delete_pending | -billable once | -billable if trashed | pending |
| MinIO deleted, finalize interrupted | removed | delete_pending | unchanged | unchanged | processing/stale |
| Worker finalized | removed | deleted | unchanged | unchanged | completed |
| Missing MinIO object | removed | deleted | unchanged | unchanged | completed + audit |

The enforced reconciliation invariants are:

```text
active_bytes = used_bytes - trash_bytes
quota.used_bytes     = SUM(usage_ledger.delta_used_bytes)
quota.trash_bytes    = SUM(usage_ledger.delta_trash_bytes)
quota.reserved_bytes = SUM(usage_ledger.delta_reserved_bytes)
0 <= trash_bytes <= used_bytes
```

Acceptance also checks no reservation remains and every permanent-delete job
has a `storage_object_id`. Postman runs in silent mode so reporters cannot print
presigned URLs.

## Concurrency decisions

- Restore and purge serialize on the Item row. Restore winning changes the
  state to `ready`, so the expired-trash purge precondition fails. Purge winning
  removes the Item, so restore returns the ownership-safe 404.
- File access revalidates owner, Item, storage object, state, and deadline after
  MinIO signing. If delete commits while signing, the generated URL is discarded
  and `delete_pending` is returned.
- Logical purge commits before MinIO is called. A crash after object deletion is
  recovered by the same job because missing object is an idempotent success.

## Closed findings

| Severity | Finding | Resolution |
|---|---|---|
| MAJOR | Delete could win while preview was signing and the stale URL could still be returned | Added post-sign database revalidation and a deterministic barrier test |
| MAJOR | PostgreSQL could not infer one audit parameter type in the real integration run | Added explicit varchar/UUID casts and reran PostgreSQL acceptance |
| MAJOR | Crash between MinIO delete and metadata finalize needed durable recovery | Missing-object retry finalizes metadata/audit; failure injection proves it |
| MINOR | Dead jobs and purge outcomes lacked direct operational counters | Added worker Prometheus counters and tests |

No open BLOCKER or MAJOR finding remains when the commands below pass.

## Reproducible commands

```bash
make test-trash-gate2
go test -race -count=1 ./internal/repository ./internal/worker/... ./internal/fileaccess
go test -race -count=1 ./...
go vet ./...
```

`test-trash-gate2` requires `TEST_DATABASE_URL` migrated through `000006` and a
real MinIO endpoint in `TEST_MINIO_ENDPOINT`.
