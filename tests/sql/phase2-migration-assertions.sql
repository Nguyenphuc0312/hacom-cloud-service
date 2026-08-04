\set ON_ERROR_STOP on

DO $$
DECLARE
  fixture_drive UUID;
  fixture_used BIGINT;
  fixture_trash BIGINT;
  pending_index_count INTEGER;
BEGIN
  SELECT drive.id, quota.used_bytes, quota.trash_bytes
  INTO fixture_drive, fixture_used, fixture_trash
  FROM cloud.drives AS drive
  JOIN cloud.quotas AS quota ON quota.drive_id = drive.id
  WHERE drive.name = 'Phase 2 migration fixture';

  IF fixture_drive IS NULL THEN
    RAISE EXCEPTION 'Phase 1 fixture was not preserved';
  END IF;
  IF fixture_used <> 600 OR fixture_trash <> 200 THEN
    RAISE EXCEPTION
      'Unsafe backfill result: used_bytes=%, trash_bytes=%',
      fixture_used,
      fixture_trash;
  END IF;

  IF fixture_used - fixture_trash <> 400 THEN
    RAISE EXCEPTION 'active = used - trash invariant failed';
  END IF;

  SELECT COUNT(*)
  INTO pending_index_count
  FROM pg_indexes
  WHERE schemaname = 'cloud'
    AND tablename = 'quota_requests'
    AND indexname = 'cloud_quota_requests_one_pending_per_drive_uq'
    AND indexdef ILIKE '%UNIQUE%'
    AND indexdef ILIKE '%WHERE (status = ''pending''%';

  IF pending_index_count <> 1 THEN
    RAISE EXCEPTION 'Pending quota request unique partial index is missing';
  END IF;

  BEGIN
    UPDATE cloud.quotas
    SET trash_bytes = used_bytes + 1
    WHERE drive_id = fixture_drive;
    RAISE EXCEPTION 'trash_bytes > used_bytes was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;
