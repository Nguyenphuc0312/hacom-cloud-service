# Process 5 — deployment and rollback guide

## Preconditions

- Use the release SHAs in `process5-release-report-phase2.md`.
- Copy `.env.example` to a protected `.env`; never commit secrets.
- Confirm PostgreSQL and MinIO backups/snapshots before production migration.
- Production must use `AUTH_MODE=jwt`; `AUTH_MODE=demo` is local/test only.

## Local/staging deployment

```bash
docker compose -f deployments/docker-compose.yml up -d postgres minio minio-init
export DATABASE_URL='postgres://hacom:<secret>@<db-host>:5432/hacom_cloud?sslmode=require'
migrate -path migrations -database "$DATABASE_URL" up
go build -trimpath -o bin/cloud-api ./cmd/api
go build -trimpath -o bin/cloud-worker ./cmd/worker
./bin/cloud-api
./bin/cloud-worker
```

Run `GET /health/ready` and verify the worker metrics endpoint before routing
traffic. Deploy API and Worker from the same backend SHA. The frontend must be
built with the matching Cloud API base URL and served behind the approved
same-origin `/cloud-api` route.

## Safe migration rollback

1. Stop new writes or drain the API and record the request ID of the change.
2. Confirm no migration is dirty and take a database backup.
3. Roll back only the migration introduced by the release:

```bash
migrate -path migrations -database "$DATABASE_URL" version
migrate -path migrations -database "$DATABASE_URL" down 1
```

4. Run the matching schema verification and reconciliation SQL.
5. Restart the previous API/Worker image and check `/health/ready`.
6. Resume traffic only after quota, audit, job and orphan counts reconcile.

Never edit quota, ledger, audit, item or job rows by hand to force a rollback.
If a migration is dirty, preserve the database for investigation and restore the
backup rather than guessing a repair.

## Application rollback

- API and Worker: roll back together to the previous tested backend SHA.
- Frontend: roll back the static bundle to the previous frontend SHA; keep the
  same-origin proxy contract stable.
- MinIO objects are not deleted by an application image rollback. Use the worker
  recovery runbook for already-enqueued permanent-delete jobs.
- Keep append-only audit evidence and the release report from the failed version.

## Post-rollback checks

```bash
curl -fsS "$CLOUD_BASE/health/ready"
psql "$DATABASE_URL" -f scripts/reconcile-process5.sql
```

Confirm: no negative quota, `used + reserved <= quota`, no duplicate active job,
no orphan reservation, and no unexpected object deletion. Attach the output to the
incident; do not paste signed URLs or secrets into tickets.
