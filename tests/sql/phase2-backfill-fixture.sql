\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_id UUID := gen_random_uuid();
  drive_id UUID;
BEGIN
  INSERT INTO cloud.drives (owner_user_id, name)
  VALUES (owner_id, 'Phase 2 migration fixture')
  RETURNING id INTO drive_id;

  INSERT INTO cloud.quotas (drive_id, used_bytes)
  VALUES (drive_id, 600);

  INSERT INTO cloud.items (
    drive_id, item_type, status, text_content,
    size_bytes, billable_bytes
  ) VALUES (
    drive_id, 'text', 'ready', 'active fixture',
    400, 400
  );

  INSERT INTO cloud.items (
    drive_id, item_type, status, text_content,
    size_bytes, billable_bytes, deleted_at, purge_after
  ) VALUES (
    drive_id, 'text', 'trashed', 'trash fixture',
    200, 200, NOW(), NOW() + INTERVAL '24 hours'
  );

  INSERT INTO cloud.usage_ledger (
    drive_id, event_type, delta_used_bytes, idempotency_key
  ) VALUES (
    drive_id, 'consume', 600, 'phase2-backfill-fixture'
  );
END;
$$;
