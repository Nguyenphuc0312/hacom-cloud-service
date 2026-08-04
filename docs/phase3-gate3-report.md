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
| Trace continuity | Admin client test and audit `request_id=trace-admin-review` assertion | PASS |
| Sensitive-data controls | common audit writer rejects sensitive metadata keys; metrics use bounded enums | PASS |

## Security acceptance

- Revoked permission fails closed even if the browser JWT still contains the permission.
- Refreshed Auth actor mismatch is rejected before Cloud is called.
- Browser JSON has no actor property; Admin Service overwrites the Cloud actor header
  from the verified principal.
- Cloud rejects missing/invalid service token and requires the exact service scope.
- A duplicate approval with the same operation ID returns `applied=false`; a different
  operation after completion returns invalid state and cannot increment quota again.
- Neither reason text nor file/object metadata is emitted to logs or metrics.

## Findings

No Phase 3 BLOCKER or MAJOR finding remains in the implemented scope. Shared-package
version drift already present in Auth/Admin Service may prevent their unrelated full
repository typecheck; Phase 3 targeted tests and Cloud production build are required
release checks until that workspace dependency is synchronized.

Gate 3 status: **PASS for Phase 3 Search + Quota Request + Admin Review**.
