\set ON_ERROR_STOP on

-- Read-only Phase 2 reconciliation. A healthy database returns zero rows.
WITH item_totals AS (
  SELECT
    drive_id,
    COALESCE(SUM(billable_bytes) FILTER (
      WHERE status IN ('processing', 'ready', 'trashed')
    ), 0) AS item_used_bytes,
    COALESCE(SUM(billable_bytes) FILTER (
      WHERE status = 'trashed'
    ), 0) AS item_trash_bytes
  FROM cloud.items
  GROUP BY drive_id
),
ledger_totals AS (
  SELECT
    drive_id,
    COALESCE(SUM(delta_used_bytes), 0) AS ledger_used_bytes,
    COALESCE(SUM(delta_reserved_bytes), 0) AS ledger_reserved_bytes
  FROM cloud.usage_ledger
  GROUP BY drive_id
)
SELECT
  drive.id AS drive_id,
  quota.quota_bytes,
  quota.used_bytes,
  quota.trash_bytes,
  quota.used_bytes - quota.trash_bytes AS active_bytes,
  quota.reserved_bytes,
  quota.quota_bytes - quota.used_bytes - quota.reserved_bytes AS available_bytes,
  COALESCE(item.item_used_bytes, 0) AS item_used_bytes,
  COALESCE(item.item_trash_bytes, 0) AS item_trash_bytes,
  COALESCE(ledger.ledger_used_bytes, 0) AS ledger_used_bytes,
  COALESCE(ledger.ledger_reserved_bytes, 0) AS ledger_reserved_bytes,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN quota.drive_id IS NULL THEN 'missing_quota' END,
    CASE WHEN quota.trash_bytes <> COALESCE(item.item_trash_bytes, 0)
      THEN 'trash_vs_item' END,
    CASE WHEN quota.used_bytes <> COALESCE(item.item_used_bytes, 0)
      THEN 'used_vs_item' END,
    CASE WHEN quota.used_bytes <> COALESCE(ledger.ledger_used_bytes, 0)
      THEN 'used_vs_ledger' END,
    CASE WHEN quota.reserved_bytes <> COALESCE(ledger.ledger_reserved_bytes, 0)
      THEN 'reserved_vs_ledger' END,
    CASE WHEN quota.trash_bytes < 0 OR quota.trash_bytes > quota.used_bytes
      THEN 'trash_invariant' END,
    CASE WHEN quota.used_bytes + quota.reserved_bytes > quota.quota_bytes
      THEN 'capacity_invariant' END
  ], NULL) AS mismatches
FROM cloud.drives AS drive
LEFT JOIN cloud.quotas AS quota ON quota.drive_id = drive.id
LEFT JOIN item_totals AS item ON item.drive_id = drive.id
LEFT JOIN ledger_totals AS ledger ON ledger.drive_id = drive.id
WHERE quota.drive_id IS NULL
   OR quota.trash_bytes <> COALESCE(item.item_trash_bytes, 0)
   OR quota.used_bytes <> COALESCE(item.item_used_bytes, 0)
   OR quota.used_bytes <> COALESCE(ledger.ledger_used_bytes, 0)
   OR quota.reserved_bytes <> COALESCE(ledger.ledger_reserved_bytes, 0)
   OR quota.trash_bytes < 0
   OR quota.trash_bytes > quota.used_bytes
   OR quota.used_bytes + quota.reserved_bytes > quota.quota_bytes
ORDER BY drive.id;
