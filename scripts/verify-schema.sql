\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  expected_tables TEXT[] := ARRAY[
    'audit_logs',
    'drives',
    'item_lifecycle_operations',
    'items',
    'jobs',
    'outbox_events',
    'quota_requests',
    'quotas',
    'storage_objects',
    'upload_parts',
    'upload_sessions',
    'usage_ledger'
  ];
  actual_tables TEXT[];
  external_fk_count INTEGER;
  owner_a UUID := gen_random_uuid();
  drive_a UUID;
  drive_b UUID;
  object_a UUID;
  item_a UUID;
  session_a UUID;
  ledger_a UUID;
  quota_request_a UUID;
  quota_request_status_values TEXT[];
  quota_event_type_values TEXT[];
  search_index_count INTEGER;
BEGIN
  SELECT array_agg(table_name ORDER BY table_name)
  INTO actual_tables
  FROM information_schema.tables
  WHERE table_schema = 'cloud'
    AND table_type = 'BASE TABLE';

  IF actual_tables IS DISTINCT FROM expected_tables THEN
    RAISE EXCEPTION
      'Unexpected cloud tables. expected=%, actual=%',
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
    RAISE EXCEPTION 'Cloud schema contains cross-service foreign keys';
  END IF;

  SELECT array_agg(enum_value ORDER BY enum_order)
  INTO quota_request_status_values
  FROM (
    SELECT enumlabel::TEXT AS enum_value, enumsortorder AS enum_order
    FROM pg_enum
    WHERE enumtypid = 'cloud.quota_request_status'::regtype
  ) AS status_values;

  IF quota_request_status_values IS DISTINCT FROM ARRAY['pending', 'approved', 'rejected'] THEN
    RAISE EXCEPTION
      'Unexpected quota request statuses: %',
      quota_request_status_values;
  END IF;

  SELECT COUNT(*) INTO search_index_count
  FROM pg_indexes
  WHERE schemaname = 'cloud'
    AND indexname IN (
      'cloud_items_search_vector_idx',
      'cloud_items_search_trgm_idx',
      'cloud_items_active_type_timeline_idx',
      'cloud_items_trash_type_timeline_idx'
    );
  IF search_index_count <> 4 THEN
    RAISE EXCEPTION 'Phase 3 search indexes are incomplete: %/4', search_index_count;
  END IF;

  IF to_regclass('cloud.cloud_outbox_pending_idx') IS NULL THEN
    RAISE EXCEPTION 'Quota-request outbox pending index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='cloud' AND table_name='items' AND column_name='search_vector'
  ) THEN
    RAISE EXCEPTION 'cloud.items.search_vector is missing';
  END IF;

  SELECT array_agg(enum_value ORDER BY enum_order)
  INTO quota_event_type_values
  FROM (
    SELECT enumlabel::TEXT AS enum_value, enumsortorder AS enum_order
    FROM pg_enum
    WHERE enumtypid = 'cloud.quota_event_type'::regtype
  ) AS event_values;

  IF quota_event_type_values IS DISTINCT FROM ARRAY[
    'reserve', 'commit', 'release', 'consume',
    'trash', 'restore', 'purge', 'reconcile'
  ] THEN
    RAISE EXCEPTION 'Unexpected quota event types: %', quota_event_type_values;
  END IF;

  INSERT INTO cloud.drives (owner_user_id, name)
  VALUES (owner_a, 'Schema verification A')
  RETURNING id INTO drive_a;

  INSERT INTO cloud.drives (owner_user_id, name)
  VALUES (gen_random_uuid(), 'Schema verification B')
  RETURNING id INTO drive_b;

  INSERT INTO cloud.quotas (drive_id)
  VALUES (drive_a), (drive_b);

  BEGIN
    INSERT INTO cloud.drives (owner_user_id, name)
    VALUES (owner_a, 'Duplicate personal drive');

    RAISE EXCEPTION 'Duplicate personal drive was incorrectly accepted';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  IF (
    SELECT quota_bytes
    FROM cloud.quotas
    WHERE drive_id = drive_a
  ) <> 5000000000 THEN
    RAISE EXCEPTION 'Default quota is not 5 decimal GB';
  END IF;

  IF (
    SELECT trash_bytes
    FROM cloud.quotas
    WHERE drive_id = drive_a
  ) <> 0 THEN
    RAISE EXCEPTION 'Default trash usage is not zero';
  END IF;

  BEGIN
    UPDATE cloud.quotas
    SET trash_bytes = used_bytes + 1
    WHERE drive_id = drive_a;

    RAISE EXCEPTION 'trash_bytes greater than used_bytes was incorrectly accepted';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  INSERT INTO cloud.quota_requests (
    drive_id,
    requested_by_user_id,
    current_quota_bytes,
    requested_quota_bytes,
    idempotency_key,
    reason
  )
  VALUES (
    drive_a,
    owner_a,
    5000000000,
    10000000000,
    'verify-quota-request',
    'Schema verification'
  )
  RETURNING id INTO quota_request_a;

  INSERT INTO cloud.outbox_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES (
    'quota_request', quota_request_a, 'cloud.quota_request.created',
    jsonb_build_object('requestId', quota_request_a, 'requestedQuotaBytes', 10000000000::BIGINT)
  );

  BEGIN
    INSERT INTO cloud.quota_requests (
      drive_id,
      requested_by_user_id,
      current_quota_bytes,
      requested_quota_bytes,
      idempotency_key
    )
    VALUES (
      drive_a,
      owner_a,
      5000000000,
      15000000000,
      'verify-second-pending-request'
    );

    RAISE EXCEPTION 'A second pending quota request was incorrectly accepted';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO cloud.quota_requests (
      drive_id,
      requested_by_user_id,
      current_quota_bytes,
      requested_quota_bytes,
      idempotency_key
    )
    VALUES (
      drive_b,
      owner_a,
      5000000000,
      5000000000,
      'verify-invalid-increase'
    );

    RAISE EXCEPTION 'A non-increasing quota request was incorrectly accepted';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  UPDATE cloud.quota_requests
  SET
    status = 'approved',
    reviewed_by_user_id = gen_random_uuid(),
    reviewed_at = NOW(),
    review_operation_id = 'verify-schema-approval'
  WHERE id = quota_request_a;

  INSERT INTO cloud.items (
    drive_id,
    item_type,
    status,
    text_content,
    size_bytes,
    billable_bytes
  )
  VALUES (
    drive_a,
    'text',
    'ready',
    'schema verification',
    19,
    19
  );

  BEGIN
    INSERT INTO cloud.items (
      drive_id,
      item_type,
      status,
      size_bytes,
      billable_bytes
    )
    VALUES (
      drive_a,
      'file',
      'pending',
      1,
      1
    );

    RAISE EXCEPTION 'Binary item without storage object was incorrectly accepted';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  BEGIN
    INSERT INTO cloud.storage_objects (
      drive_id,
      bucket,
      object_key,
      original_name,
      content_type,
      declared_size_bytes
    )
    VALUES (
      drive_a,
      'hacom-cloud-private',
      'verify/too-large',
      'too-large.bin',
      'application/octet-stream',
      100000001
    );

    RAISE EXCEPTION 'Object larger than 100 decimal MB was incorrectly accepted';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  INSERT INTO cloud.storage_objects (
    drive_id,
    bucket,
    object_key,
    original_name,
    content_type,
    declared_size_bytes
  )
  VALUES (
    drive_a,
    'hacom-cloud-private',
    'verify/object-a',
    'verify.txt',
    'text/plain',
    12
  )
  RETURNING id INTO object_a;

  INSERT INTO cloud.items (
    drive_id,
    item_type,
    status,
    title,
    storage_object_id,
    size_bytes,
    billable_bytes,
    source_type
  )
  VALUES (
    drive_a,
    'file',
    'pending',
    'verify.txt',
    object_a,
    12,
    12,
    'cloud_upload'
  )
  RETURNING id INTO item_a;

  IF (SELECT search_text FROM cloud.items WHERE id = item_a) NOT ILIKE '%verify.txt%' THEN
    RAISE EXCEPTION 'File name was not copied into the Item search document';
  END IF;

  UPDATE cloud.storage_objects SET original_name = 'verify-renamed.pdf' WHERE id = object_a;
  IF (SELECT search_text FROM cloud.items WHERE id = item_a) NOT ILIKE '%verify-renamed.pdf%' THEN
    RAISE EXCEPTION 'File name update did not refresh the Item search document';
  END IF;

  BEGIN
    INSERT INTO cloud.upload_sessions (
      drive_id,
      item_id,
      storage_object_id,
      original_name,
      content_type,
      declared_size_bytes,
      reserved_bytes,
      idempotency_key,
      expires_at
    )
    VALUES (
      drive_b,
      item_a,
      object_a,
      'cross-drive.txt',
      'text/plain',
      12,
      12,
      'verify-cross-drive',
      NOW() + INTERVAL '15 minutes'
    );

    RAISE EXCEPTION 'Cross-drive upload was incorrectly accepted';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;

  INSERT INTO cloud.upload_sessions (
    drive_id,
    item_id,
    storage_object_id,
    original_name,
    content_type,
    declared_size_bytes,
    reserved_bytes,
    idempotency_key,
    expires_at
  )
  VALUES (
    drive_a,
    item_a,
    object_a,
    'verify.txt',
    'text/plain',
    12,
    12,
    'verify-valid-upload',
    NOW() + INTERVAL '15 minutes'
  )
  RETURNING id INTO session_a;

  INSERT INTO cloud.usage_ledger (
    drive_id,
    item_id,
    upload_session_id,
    event_type,
    delta_reserved_bytes,
    idempotency_key
  )
  VALUES (
    drive_a,
    item_a,
    session_a,
    'reserve',
    12,
    'verify-reserve-upload'
  )
  RETURNING id INTO ledger_a;

  DELETE FROM cloud.items
  WHERE id = item_a;

  IF EXISTS (
    SELECT 1
    FROM cloud.upload_sessions
    WHERE id = session_a
  ) THEN
    RAISE EXCEPTION 'Upload session did not cascade when its item was purged';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cloud.usage_ledger
    WHERE id = ledger_a
      AND (item_id IS NOT NULL OR upload_session_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Ledger did not preserve history with cleared soft references';
  END IF;

  UPDATE cloud.quotas
  SET used_bytes = used_bytes + 19
  WHERE drive_id = drive_a;

  INSERT INTO cloud.usage_ledger (
    drive_id,
    event_type,
    delta_used_bytes,
    idempotency_key
  )
  VALUES (
    drive_a,
    'consume',
    19,
    'verify-consume-text'
  );

  BEGIN
    INSERT INTO cloud.usage_ledger (
      drive_id,
      event_type,
      delta_used_bytes,
      idempotency_key
    )
    VALUES (
      drive_a,
      'consume',
      19,
      'verify-consume-text'
    );

    RAISE EXCEPTION 'Duplicate quota event was incorrectly accepted';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  BEGIN
    UPDATE cloud.quotas
    SET reserved_bytes = quota_bytes + 1
    WHERE drive_id = drive_a;

    RAISE EXCEPTION 'Quota overflow was incorrectly accepted';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  RAISE NOTICE 'Hacom Cloud schema verification passed';
END;
$$;

ROLLBACK;
