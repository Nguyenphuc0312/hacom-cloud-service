\set ON_ERROR_STOP on

DO $$
DECLARE
  quota_mismatches INTEGER;
  orphan_items INTEGER;
  orphan_sessions INTEGER;
  orphan_jobs INTEGER;
  duplicate_active_jobs INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO quota_mismatches
  FROM cloud.quotas AS quota
  LEFT JOIN (
    SELECT
      drive_id,
      COALESCE(SUM(delta_used_bytes), 0) AS used_bytes,
      COALESCE(SUM(delta_reserved_bytes), 0) AS reserved_bytes,
      COALESCE(SUM(delta_trash_bytes), 0) AS trash_bytes
    FROM cloud.usage_ledger
    GROUP BY drive_id
  ) AS ledger ON ledger.drive_id = quota.drive_id
  WHERE quota.used_bytes <> COALESCE(ledger.used_bytes, 0)
     OR quota.reserved_bytes <> COALESCE(ledger.reserved_bytes, 0)
     OR quota.trash_bytes <> COALESCE(ledger.trash_bytes, 0)
     OR quota.trash_bytes < 0
     OR quota.trash_bytes > quota.used_bytes
     OR quota.used_bytes < 0
     OR quota.reserved_bytes < 0
     OR quota.used_bytes + quota.reserved_bytes > quota.quota_bytes;

  SELECT COUNT(*)
  INTO orphan_items
  FROM cloud.items AS item
  LEFT JOIN cloud.storage_objects AS object
    ON object.id = item.storage_object_id
  WHERE item.item_type = 'file'
    AND object.id IS NULL;

  SELECT COUNT(*)
  INTO orphan_sessions
  FROM cloud.upload_sessions AS session
  LEFT JOIN cloud.items AS item ON item.id = session.item_id
  LEFT JOIN cloud.storage_objects AS object
    ON object.id = session.storage_object_id
  WHERE item.id IS NULL OR object.id IS NULL;

  SELECT COUNT(*)
  INTO orphan_jobs
  FROM cloud.jobs AS job
  LEFT JOIN cloud.items AS item ON item.id = job.item_id
  LEFT JOIN cloud.upload_sessions AS session
    ON session.id = job.upload_session_id
  WHERE (job.item_id IS NOT NULL AND item.id IS NULL)
     OR (job.upload_session_id IS NOT NULL AND session.id IS NULL);

  SELECT COUNT(*)
  INTO duplicate_active_jobs
  FROM (
    SELECT drive_id, dedupe_key
    FROM cloud.jobs
    WHERE dedupe_key IS NOT NULL
      AND status IN ('pending', 'processing', 'failed')
    GROUP BY drive_id, dedupe_key
    HAVING COUNT(*) > 1
  ) AS duplicate;

  IF quota_mismatches <> 0
    OR orphan_items <> 0
    OR orphan_sessions <> 0
    OR orphan_jobs <> 0
    OR duplicate_active_jobs <> 0 THEN
    RAISE EXCEPTION
      'Gate 5 reconciliation failed: quota=%, items=%, sessions=%, jobs=%, duplicate_jobs=%',
      quota_mismatches,
      orphan_items,
      orphan_sessions,
      orphan_jobs,
      duplicate_active_jobs;
  END IF;

  RAISE NOTICE
    'Gate 5 reconciliation passed: quota/ledger match, no orphan, no duplicate active job';
END;
$$;
