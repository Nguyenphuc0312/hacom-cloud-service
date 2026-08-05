\set ON_ERROR_STOP on

-- Gate 2 deliberately verifies migrations 000001..000006 only. Keep this
-- verifier independent from scripts/verify-schema.sql, which follows the
-- latest Gate 3 schema and therefore includes later tables and constraints.
BEGIN;

DO $$
<<verify_trash_gate2_schema>>
DECLARE
  expected_tables TEXT[] := ARRAY[
    'audit_logs',
    'drives',
    'item_lifecycle_operations',
    'items',
    'jobs',
    'quota_requests',
    'quotas',
    'storage_objects',
    'upload_parts',
    'upload_sessions',
    'usage_ledger'
  ];
  actual_tables TEXT[];
  event_values TEXT[];
  external_fk_count INTEGER;
  owner_id UUID := gen_random_uuid();
  drive_id UUID;
BEGIN
  SELECT array_agg(table_name ORDER BY table_name)
  INTO actual_tables
  FROM information_schema.tables
  WHERE table_schema = 'cloud'
    AND table_type = 'BASE TABLE';

  IF actual_tables IS DISTINCT FROM expected_tables THEN
    RAISE EXCEPTION
      'Unexpected Gate 2 cloud tables. expected=%, actual=%',
      expected_tables,
      actual_tables;
  END IF;

  SELECT COUNT(*)
  INTO external_fk_count
  FROM pg_constraint constraint_row
  JOIN pg_class source_table
    ON source_table.oid = constraint_row.conrelid
  JOIN pg_namespace source_schema
    ON source_schema.oid = source_table.relnamespace
  JOIN pg_class target_table
    ON target_table.oid = constraint_row.confrelid
  JOIN pg_namespace target_schema
    ON target_schema.oid = target_table.relnamespace
  WHERE constraint_row.contype = 'f'
    AND source_schema.nspname = 'cloud'
    AND target_schema.nspname <> 'cloud';

  IF external_fk_count <> 0 THEN
    RAISE EXCEPTION 'Gate 2 contains cross-service foreign keys';
  END IF;

  SELECT array_agg(enumlabel::TEXT ORDER BY enumsortorder)
  INTO event_values
  FROM pg_enum
  WHERE enumtypid = 'cloud.quota_event_type'::regtype;

  IF event_values IS DISTINCT FROM ARRAY[
    'reserve', 'commit', 'release', 'consume',
    'trash', 'restore', 'purge', 'reconcile'
  ] THEN
    RAISE EXCEPTION 'Unexpected Gate 2 quota event types: %', event_values;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'cloud'
      AND table_name = 'quotas'
      AND column_name = 'trash_bytes'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'cloud.quotas.trash_bytes is missing or nullable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'cloud'
      AND table_name = 'usage_ledger'
      AND column_name = 'delta_trash_bytes'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'cloud.usage_ledger.delta_trash_bytes is missing or nullable';
  END IF;

  IF to_regclass('cloud.cloud_item_lifecycle_operations_item_time_idx') IS NULL THEN
    RAISE EXCEPTION 'Gate 2 lifecycle history index is missing';
  END IF;

  INSERT INTO cloud.drives (owner_user_id, name)
  VALUES (owner_id, 'Gate 2 schema verification')
  RETURNING id INTO drive_id;

  INSERT INTO cloud.quotas (drive_id) VALUES (drive_id);

  IF (
    SELECT ROW(quota_bytes, used_bytes, reserved_bytes, trash_bytes)
    FROM cloud.quotas
    WHERE cloud.quotas.drive_id = verify_trash_gate2_schema.drive_id
  ) IS DISTINCT FROM ROW(5000000000::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT) THEN
    RAISE EXCEPTION 'Gate 2 quota defaults are invalid';
  END IF;

  BEGIN
    UPDATE cloud.quotas
    SET trash_bytes = used_bytes + 1
    WHERE cloud.quotas.drive_id = verify_trash_gate2_schema.drive_id;

    RAISE EXCEPTION 'trash_bytes > used_bytes was incorrectly accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END;
$$ LANGUAGE plpgsql;

ROLLBACK;
