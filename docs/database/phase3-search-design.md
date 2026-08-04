# Phase 3 search/filter database design

## Contract

`GET /items` and `GET /trash` share `q`, `type`, `from`, `to`, opaque cursor,
and a 1–100 page size. The repository resolves the owner's unique drive before
querying items and always applies `drive_id` plus active/Trash state. Default
ordering remains `(created_at DESC, id DESC)`.

The service normalizes whitespace and UTC timestamps, validates a 3–200 rune
query and known item type, then hashes this canonical tuple:

```text
scope | lowercase(q) | type | from | to
```

Cursor version 2 contains the last timeline key and that SHA-256 fingerprint.
A cursor is therefore invalid after any filter changes and cannot cross between
active and Trash.

## Indexed search document

Migration `000007_phase3_search_filter` adds a denormalized `search_text` and a
stored `search_vector`. Item triggers keep title, text content and link URL in
sync. A storage-object trigger also refreshes the owning Item when
`original_name` changes. Existing rows are backfilled inside the migration.

The `simple` text-search configuration is language-neutral for Vietnamese,
English, URLs and filenames. PostgreSQL uses:

- owner-scoped GIN `(drive_id, search_vector)` for token search;
- owner-scoped GIN `(drive_id, search_text gin_trgm_ops)` for substring and
  filename/URL fragments;
- partial `(drive_id, item_type, created_at DESC, id DESC)` indexes for active
  and Trash type-filtered timelines;
- the Phase 1 timeline index for unfiltered cursor pagination.

The repository's `ILIKE '%q%'` fallback is therefore indexed, not a large-table
sequential wildcard scan. `BitmapOr` combines vector and trigram candidates.

## Guardrails and rollback

`SEARCH_QUERY_TIMEOUT` defaults to 2 seconds and may not exceed 10 seconds.
Both repositories use a context deadline and transaction-local PostgreSQL
`statement_timeout`. Unknown or repeated HTTP query parameters are rejected.
No search document, storage key, bucket or other persistence detail appears in
the API response.

Rollback drops the four Phase 3 indexes, both synchronization triggers and
functions, and the generated/document columns. Database-wide `pg_trgm` and
`btree_gin` capabilities are intentionally retained because another schema may
share them, matching the existing `pgcrypto` migration policy.
Reapply safely backfills databases containing Phase 1/2 Items. The verification
script checks index presence and both Item/storage-object trigger paths.
