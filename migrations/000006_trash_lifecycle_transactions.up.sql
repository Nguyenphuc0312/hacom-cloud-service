BEGIN;

-- Rebuild the enum instead of ALTER TYPE ... ADD VALUE so migration down can
-- restore the exact Phase 1/000005 type definition.
ALTER TABLE cloud.usage_ledger
  DROP CONSTRAINT cloud_usage_ledger_event_delta_chk,
  DROP CONSTRAINT cloud_usage_ledger_non_zero_chk;

ALTER TABLE cloud.usage_ledger
  ALTER COLUMN event_type TYPE TEXT
  USING event_type::TEXT;

DROP TYPE cloud.quota_event_type;

CREATE TYPE cloud.quota_event_type AS ENUM (
  'reserve',
  'commit',
  'release',
  'consume',
  'trash',
  'restore',
  'purge',
  'reconcile'
);

ALTER TABLE cloud.usage_ledger
  ALTER COLUMN event_type TYPE cloud.quota_event_type
  USING event_type::cloud.quota_event_type,
  ADD COLUMN delta_trash_bytes BIGINT NOT NULL DEFAULT 0;

ALTER TABLE cloud.usage_ledger
  ADD CONSTRAINT cloud_usage_ledger_non_zero_chk
    CHECK (
      delta_used_bytes <> 0
      OR delta_reserved_bytes <> 0
      OR delta_trash_bytes <> 0
    ),
  ADD CONSTRAINT cloud_usage_ledger_event_delta_chk
    CHECK (
      (
        event_type = 'reserve'
        AND delta_used_bytes = 0
        AND delta_reserved_bytes > 0
        AND delta_trash_bytes = 0
      )
      OR (
        event_type = 'commit'
        AND delta_used_bytes > 0
        AND delta_reserved_bytes < 0
        AND delta_trash_bytes = 0
      )
      OR (
        event_type = 'release'
        AND delta_used_bytes = 0
        AND delta_reserved_bytes < 0
        AND delta_trash_bytes = 0
      )
      OR (
        event_type = 'consume'
        AND delta_used_bytes > 0
        AND delta_reserved_bytes = 0
        AND delta_trash_bytes = 0
      )
      OR (
        event_type = 'trash'
        AND delta_used_bytes = 0
        AND delta_reserved_bytes = 0
        AND delta_trash_bytes > 0
      )
      OR (
        event_type = 'restore'
        AND delta_used_bytes = 0
        AND delta_reserved_bytes = 0
        AND delta_trash_bytes < 0
      )
      OR (
        event_type = 'purge'
        AND delta_used_bytes < 0
        AND delta_reserved_bytes = 0
        AND (
          delta_trash_bytes = 0
          OR delta_trash_bytes = delta_used_bytes
        )
      )
      OR event_type = 'reconcile'
    );

-- Migration 000005 may already have backfilled trash_bytes from Phase 1 Item
-- rows. Seed the typed Trash ledger without rewriting used_bytes.
INSERT INTO cloud.usage_ledger (
  drive_id,
  event_type,
  delta_used_bytes,
  delta_reserved_bytes,
  delta_trash_bytes,
  idempotency_key,
  metadata
)
SELECT
  quota.drive_id,
  'reconcile',
  0,
  0,
  quota.trash_bytes,
  'phase2:trash-backfill:' || quota.drive_id::TEXT,
  jsonb_build_object('source', 'migration_000006')
FROM cloud.quotas AS quota
WHERE quota.trash_bytes > 0
ON CONFLICT (drive_id, idempotency_key) DO NOTHING;

COMMENT ON COLUMN cloud.usage_ledger.delta_trash_bytes IS
  'Append-only Trash subset delta; used_bytes remains active plus Trash';

CREATE TABLE cloud.item_lifecycle_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id UUID NOT NULL,
  item_id UUID NOT NULL,
  operation_key VARCHAR(128) NOT NULL,
  action VARCHAR(24) NOT NULL,
  from_status VARCHAR(24) NOT NULL,
  to_status VARCHAR(24),
  billable_bytes BIGINT NOT NULL,
  used_bytes_after BIGINT NOT NULL,
  trash_bytes_after BIGINT NOT NULL,
  deleted_at TIMESTAMPTZ,
  purge_after TIMESTAMPTZ,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cloud_item_lifecycle_operations_drive_fkey
    FOREIGN KEY (drive_id)
    REFERENCES cloud.drives(id)
    ON DELETE RESTRICT,
  CONSTRAINT cloud_item_lifecycle_operations_idempotency_uq
    UNIQUE (drive_id, operation_key),
  CONSTRAINT cloud_item_lifecycle_operations_key_not_blank_chk
    CHECK (btrim(operation_key) <> ''),
  CONSTRAINT cloud_item_lifecycle_operations_action_chk
    CHECK (action IN ('trash', 'restore', 'purge')),
  CONSTRAINT cloud_item_lifecycle_operations_from_status_chk
    CHECK (from_status IN ('ready', 'trashed')),
  CONSTRAINT cloud_item_lifecycle_operations_transition_chk
    CHECK (
      (action = 'trash' AND from_status = 'ready' AND to_status = 'trashed')
      OR (action = 'restore' AND from_status = 'trashed' AND to_status = 'ready')
      OR (action = 'purge' AND to_status IS NULL)
    ),
  CONSTRAINT cloud_item_lifecycle_operations_billable_chk
    CHECK (billable_bytes > 0),
  CONSTRAINT cloud_item_lifecycle_operations_quota_chk
    CHECK (
      used_bytes_after >= 0
      AND trash_bytes_after >= 0
      AND trash_bytes_after <= used_bytes_after
    ),
  CONSTRAINT cloud_item_lifecycle_operations_retention_chk
    CHECK (
      (
        action = 'trash'
        AND deleted_at IS NOT NULL
        AND purge_after = deleted_at + INTERVAL '24 hours'
      )
      OR (
        action = 'restore'
        AND deleted_at IS NULL
        AND purge_after IS NULL
      )
      OR action = 'purge'
    )
);

COMMENT ON TABLE cloud.item_lifecycle_operations IS
  'Idempotency/tombstone ledger for Trash, restore and logical permanent delete';
COMMENT ON COLUMN cloud.item_lifecycle_operations.item_id IS
  'Soft item UUID retained after permanent delete; deliberately has no item foreign key';

CREATE INDEX cloud_item_lifecycle_operations_item_time_idx
  ON cloud.item_lifecycle_operations (drive_id, item_id, occurred_at DESC, id DESC);

COMMIT;
