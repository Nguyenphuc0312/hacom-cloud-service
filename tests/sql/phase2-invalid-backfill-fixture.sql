\set ON_ERROR_STOP on

DO $$
DECLARE
  drive_id UUID;
BEGIN
  INSERT INTO cloud.drives (owner_user_id, name)
  VALUES (gen_random_uuid(), 'Phase 2 invalid backfill fixture')
  RETURNING id INTO drive_id;

  -- Deliberately model an already-corrupt Phase 1 snapshot. Migration 000005
  -- must reject it instead of silently increasing used_bytes.
  INSERT INTO cloud.quotas (drive_id, used_bytes)
  VALUES (drive_id, 100);

  INSERT INTO cloud.items (
    drive_id, item_type, status, text_content,
    size_bytes, billable_bytes, deleted_at, purge_after
  ) VALUES (
    drive_id, 'text', 'trashed', 'invalid trash fixture',
    200, 200, NOW(), NOW() + INTERVAL '24 hours'
  );
END;
$$;
