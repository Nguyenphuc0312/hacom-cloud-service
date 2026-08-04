# Gate 3 QA report

## Scope and evidence

| Gate | Evidence | Result |
|---|---|---|
| Active/Trash search and stable cursor | repository cursor/filter integration suite; cursor fingerprint contract | PASS |
| Search performance | 105,000-item benchmark: active 6.499 ms, Trash 4.398 ms, cursor 0.248 ms; all below the 2 s safety budget | PASS |
| One pending request | concurrent create integration tests and unique partial index | PASS |
| Authorized admin review | fresh Auth `/v1/auth/me`, exact `cloud.quota.review`, service-token scope tests | PASS |
| Idempotent approval | row-lock transaction test repeats the same operation and proves one audit/quota update | PASS |
| Transactional quota/audit | PostgreSQL integration assertion after approve | PASS |
| Reject transaction/idempotency | PostgreSQL test proves unchanged quota, one audit, actor/trace and conflicting-decision rejection | PASS |
| Trace continuity | Admin client test and audit `request_id=trace-admin-review` assertion | PASS |
| Sensitive-data controls | common audit writer rejects sensitive metadata keys; metrics use bounded enums | PASS |
| Audit immutability | migration 000010 rejects UPDATE/DELETE with SQLSTATE 55000; down/up recovery tested | PASS |
| Cross-service E2E contract | seven-step Postman approve/reject/retry flow plus static contract and `make test-postman-phase3` | PASS |

## Security acceptance

- Revoked permission fails closed even if the browser JWT still contains the permission.
- Refreshed Auth actor mismatch is rejected before Cloud is called.
- Browser JSON has no actor property; Admin Service overwrites the Cloud actor header
  from the verified principal.
- Cloud rejects missing/invalid service token and requires the exact service scope.
- A duplicate approval with the same operation ID returns `applied=false`; a different
  operation after completion returns invalid state and cannot increment quota again.
- Neither reason text nor file/object metadata is emitted to logs or metrics.
- Metric business rejection and internal-error outcomes are tested separately.

## Findings

No Phase 3 BLOCKER or MAJOR finding remains. The local shared-types package is built
before consumers; `chat-auth-service` typecheck, `chat-admin-service` production build,
Cloud full Go suite and the PostgreSQL Gate 3 acceptance suite all pass.

Gate 3 status: **PASS for Phase 3 Search + Quota Request + Admin Review**.
