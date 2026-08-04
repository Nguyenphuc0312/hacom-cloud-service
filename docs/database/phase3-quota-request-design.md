# Phase 3 user quota-request design

## User contract

The public user boundary exposes only create and read-current operations:

```text
POST /quota/requests
GET  /quota/requests/current
```

There is intentionally no direct quota update. The Phase 2 enum contains only
`pending`, `approved`, and `rejected`; the frozen product contract defines no
cancel endpoint or cancelled state, so this implementation does not invent one.
Admin review is owned by the next Phase 3 work item.

Byte values use signed 64-bit integers from JSON through PostgreSQL `BIGINT`.
Allowed tiers come from `QUOTA_REQUEST_TIERS_BYTES`; defaults are 10, 25, and 50
decimal GB. A requested tier must exceed the quota snapshot locked at creation.

## Transaction and locking

Create uses one PostgreSQL transaction and a fixed lock order:

```text
ensure drive → lock drive → ensure quota → lock quota
→ lock/read idempotency record → lock/read pending request
→ insert request → insert audit → insert outbox → commit
```

The drive lock serializes concurrent requests for one owner. The existing
partial unique index on `(drive_id) WHERE status='pending'` remains the final
database arbiter. Retry with the same key and identical quota/reason returns the
original request without new audit/outbox rows; different input returns
`IDEMPOTENCY_CONFLICT`.

| Current state | User operation | Result |
|---|---|---|
| no request | create valid tier | `pending`, applied once |
| pending | retry identical key/payload | same request, `applied=false` |
| pending | create another key | `QUOTA_REQUEST_PENDING` |
| any | reuse key with changed payload | `IDEMPOTENCY_CONFLICT` |
| approved/rejected | create new valid higher tier | new `pending` allowed |
| any | cancel/direct quota update | not part of the user contract |

## Audit and notification boundary

Migration `000008_quota_request_outbox` adds a generic transactional outbox.
Create writes `cloud.quota_request.created` with request/drive/actor and integer
quota snapshots. No publisher is started until notification integration is
contracted. The sensitive free-text reason is excluded from audit metadata,
outbox payload, logs, and metrics; audit records only `reasonPresent`.

The migration has a down path that drops only the new outbox table. It does not
modify the Phase 2 quota-request enum or migrations.
