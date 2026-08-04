\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_id UUID := gen_random_uuid();
  drive_id UUID;
  item_id UUID := gen_random_uuid();
  deleted_at_value TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
BEGIN
  INSERT INTO cloud.drives (owner_user_id, name)
  VALUES (owner_id, 'Trash lifecycle rollback fixture')
  RETURNING id INTO drive_id;

  INSERT INTO cloud.quotas (drive_id, used_bytes, trash_bytes)
  VALUES (drive_id, 10, 10);

  INSERT INTO cloud.items (
    id, drive_id, item_type, status, text_content,
    size_bytes, billable_bytes, deleted_at, purge_after
  ) VALUES (
    item_id, drive_id, 'text', 'trashed', 'rollback fixture',
    10, 10, deleted_at_value, deleted_at_value + INTERVAL '24 hours'
  );

  INSERT INTO cloud.usage_ledger (
    drive_id, item_id, event_type, delta_used_bytes,
    delta_trash_bytes, idempotency_key
  ) VALUES
    (drive_id, item_id, 'consume', 10, 0, 'trash-rollback-consume'),
    (drive_id, item_id, 'trash', 0, 10, 'trash-rollback-move');

  INSERT INTO cloud.item_lifecycle_operations (
    drive_id, item_id, operation_key, action, from_status, to_status,
    billable_bytes, used_bytes_after, trash_bytes_after,
    deleted_at, purge_after, occurred_at
  ) VALUES (
    drive_id, item_id, 'trash-rollback-move', 'trash', 'ready', 'trashed',
    10, 10, 10, deleted_at_value,
    deleted_at_value + INTERVAL '24 hours', deleted_at_value
  );

  INSERT INTO cloud.audit_logs (
    occurred_at, actor_user_id, actor_type, request_id,
    action, entity_type, entity_id, drive_id
  ) VALUES (
    deleted_at_value, owner_id, 'user', 'trash-rollback-move',
    'cloud.item.trash', 'cloud_item', item_id, drive_id
  );
END;
$$;
