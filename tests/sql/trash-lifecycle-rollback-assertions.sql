\set ON_ERROR_STOP on

DO $$
DECLARE
  stored_used BIGINT;
  stored_trash BIGINT;
  item_used BIGINT;
  item_trash BIGINT;
  ledger_used BIGINT;
  ledger_trash BIGINT;
  operation_count INTEGER;
  audit_count INTEGER;
BEGIN
  SELECT
    quota.used_bytes,
    quota.trash_bytes,
    COALESCE(SUM(item.billable_bytes) FILTER (
      WHERE item.status IN ('processing', 'ready', 'trashed')
    ), 0),
    COALESCE(SUM(item.billable_bytes) FILTER (
      WHERE item.status = 'trashed'
    ), 0),
    (SELECT COALESCE(SUM(delta_used_bytes), 0)
     FROM cloud.usage_ledger WHERE drive_id = drive.id),
    (SELECT COALESCE(SUM(delta_trash_bytes), 0)
     FROM cloud.usage_ledger WHERE drive_id = drive.id),
    (SELECT COUNT(*) FROM cloud.item_lifecycle_operations
     WHERE drive_id = drive.id),
    (SELECT COUNT(*) FROM cloud.audit_logs WHERE drive_id = drive.id)
  INTO
    stored_used, stored_trash, item_used, item_trash,
    ledger_used, ledger_trash, operation_count, audit_count
  FROM cloud.drives AS drive
  JOIN cloud.quotas AS quota ON quota.drive_id = drive.id
  LEFT JOIN cloud.items AS item ON item.drive_id = drive.id
  WHERE drive.name = 'Trash lifecycle rollback fixture'
  GROUP BY drive.id, quota.drive_id;

  IF stored_used IS NULL THEN
    RAISE EXCEPTION 'Trash rollback fixture was not preserved';
  END IF;
  IF stored_used <> 10 OR stored_trash <> 10
    OR item_used <> 10 OR item_trash <> 10
    OR ledger_used <> 10 OR ledger_trash <> 10 THEN
    RAISE EXCEPTION
      'Trash rollback reconciliation failed: quota=%/%, item=%/%, ledger=%/%',
      stored_used, stored_trash, item_used, item_trash, ledger_used, ledger_trash;
  END IF;
  IF operation_count <> 0 THEN
    RAISE EXCEPTION '000006 down retained operation rows unexpectedly';
  END IF;
  IF audit_count <> 1 THEN
    RAISE EXCEPTION 'Audit evidence was not preserved across 000006 down/up';
  END IF;
END;
$$;
