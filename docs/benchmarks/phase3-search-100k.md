# Phase 3 search benchmark — 105,000 Items

Measured on 2026-08-04 using PostgreSQL 16 Alpine in the repository Docker
Compose environment. The fixture contains 100,000 Items for the target drive
and 5,000 matching decoys for another owner. `statement_timeout` was 2 seconds.
Scripts are reproducible at `tests/sql/phase3-search-benchmark-seed.sql` and
`tests/sql/phase3-search-explain.sql`.

## Results

| Query | Execution time | Plan evidence |
|---|---:|---|
| Resolve owner drive | 0.085 ms | unique owner predicate; planner used a 2-row seq scan in this tiny drive table |
| Active q + timeline | 6.499 ms | owner-scoped vector/trigram `BitmapOr`, top-N sort |
| Trash q + type + date | 4.398 ms | owner-scoped vector/trigram `BitmapOr`; state/type/date recheck |
| Default cursor timeline | 0.248 ms | `cloud_items_timeline_idx` index-only scan |

All measured queries completed below 7 ms execution time and far below the
2-second safety limit. Active search returned 90 owned matches and discarded
only 10 same-owner Trash rows. It did not scan the 5,000 cross-owner decoys:

```text
Bitmap Index Scan on cloud_items_search_vector_idx
  Index Cond: (drive_id = <owned-drive> AND search_vector @@ <query>)
Bitmap Index Scan on cloud_items_search_trgm_idx
  Index Cond: (drive_id = <owned-drive> AND search_text ILIKE <query>)
```

The populated-database rollback/reapply check completed migration 000007 down
in 53.8 ms and up/backfill/index creation in 8.71 s. Verification returned
105,000 Items and zero blank search documents.

These numbers are a local baseline, not a production SLA. Re-run after material
changes to data distribution, PostgreSQL settings, query shape or indexes.
