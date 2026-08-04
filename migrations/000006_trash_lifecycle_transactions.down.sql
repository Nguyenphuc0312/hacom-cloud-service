BEGIN;

DROP TABLE IF EXISTS cloud.item_lifecycle_operations;

ALTER TABLE cloud.usage_ledger
  DROP CONSTRAINT cloud_usage_ledger_event_delta_chk,
  DROP CONSTRAINT cloud_usage_ledger_non_zero_chk;

-- Phase 1 has no typed Trash delta and its non-zero constraint cannot encode
-- move/restore rows (both have zero used/reserved delta). Audit logs retain the
-- lifecycle evidence; these Phase 2-only quota rows are removed on rollback.
DELETE FROM cloud.usage_ledger
WHERE event_type IN ('trash', 'restore')
   OR (
     event_type = 'reconcile'
     AND delta_used_bytes = 0
     AND delta_reserved_bytes = 0
     AND delta_trash_bytes <> 0
   );

ALTER TABLE cloud.usage_ledger
  ALTER COLUMN event_type TYPE TEXT
  USING event_type::TEXT;

DROP TYPE cloud.quota_event_type;

CREATE TYPE cloud.quota_event_type AS ENUM (
  'reserve',
  'commit',
  'release',
  'consume',
  'purge',
  'reconcile'
);

ALTER TABLE cloud.usage_ledger
  ALTER COLUMN event_type TYPE cloud.quota_event_type
  USING event_type::cloud.quota_event_type,
  DROP COLUMN delta_trash_bytes;

ALTER TABLE cloud.usage_ledger
  ADD CONSTRAINT cloud_usage_ledger_non_zero_chk
    CHECK (delta_used_bytes <> 0 OR delta_reserved_bytes <> 0),
  ADD CONSTRAINT cloud_usage_ledger_event_delta_chk
    CHECK (
      (
        event_type = 'reserve'
        AND delta_used_bytes = 0
        AND delta_reserved_bytes > 0
      )
      OR (
        event_type = 'commit'
        AND delta_used_bytes > 0
        AND delta_reserved_bytes < 0
      )
      OR (
        event_type = 'release'
        AND delta_used_bytes = 0
        AND delta_reserved_bytes < 0
      )
      OR (
        event_type = 'consume'
        AND delta_used_bytes > 0
        AND delta_reserved_bytes = 0
      )
      OR (
        event_type = 'purge'
        AND delta_used_bytes < 0
        AND delta_reserved_bytes = 0
      )
      OR event_type = 'reconcile'
    );

COMMIT;
