BEGIN;

CREATE TABLE cloud.upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id UUID NOT NULL,
  item_id UUID NOT NULL,
  storage_object_id UUID NOT NULL,
  status cloud.upload_status NOT NULL DEFAULT 'initiated',
  original_name VARCHAR(1024) NOT NULL,
  content_type VARCHAR(255) NOT NULL,
  declared_size_bytes BIGINT NOT NULL,
  reserved_bytes BIGINT NOT NULL,
  actual_size_bytes BIGINT,
  expected_checksum_sha256 CHAR(64),
  actual_checksum_sha256 CHAR(64),
  minio_upload_id TEXT,
  idempotency_key VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failure_code VARCHAR(64),
  failure_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cloud_upload_sessions_drive_fkey
    FOREIGN KEY (drive_id)
    REFERENCES cloud.drives(id)
    ON DELETE RESTRICT,
  CONSTRAINT cloud_upload_sessions_id_drive_uq
    UNIQUE (id, drive_id),
  CONSTRAINT cloud_upload_sessions_item_drive_fkey
    FOREIGN KEY (item_id, drive_id)
    REFERENCES cloud.items(id, drive_id)
    ON DELETE CASCADE,
  CONSTRAINT cloud_upload_sessions_object_drive_fkey
    FOREIGN KEY (storage_object_id, drive_id)
    REFERENCES cloud.storage_objects(id, drive_id)
    ON DELETE CASCADE,
  CONSTRAINT cloud_upload_sessions_object_uq
    UNIQUE (storage_object_id),
  CONSTRAINT cloud_upload_sessions_idempotency_uq
    UNIQUE (drive_id, idempotency_key),
  CONSTRAINT cloud_upload_sessions_name_not_blank_chk
    CHECK (btrim(original_name) <> ''),
  CONSTRAINT cloud_upload_sessions_content_type_not_blank_chk
    CHECK (btrim(content_type) <> ''),
  CONSTRAINT cloud_upload_sessions_declared_size_chk
    CHECK (declared_size_bytes BETWEEN 1 AND 104857600),
  CONSTRAINT cloud_upload_sessions_reserved_size_chk
    CHECK (
      reserved_bytes BETWEEN 1 AND 104857600
      AND reserved_bytes = declared_size_bytes
    ),
  CONSTRAINT cloud_upload_sessions_actual_size_chk
    CHECK (
      actual_size_bytes IS NULL
      OR actual_size_bytes BETWEEN 1 AND 104857600
    ),
  CONSTRAINT cloud_upload_sessions_expected_checksum_chk
    CHECK (
      expected_checksum_sha256 IS NULL
      OR expected_checksum_sha256 ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT cloud_upload_sessions_actual_checksum_chk
    CHECK (
      actual_checksum_sha256 IS NULL
      OR actual_checksum_sha256 ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT cloud_upload_sessions_idempotency_not_blank_chk
    CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT cloud_upload_sessions_expiry_chk
    CHECK (expires_at > created_at),
  CONSTRAINT cloud_upload_sessions_uploaded_at_chk
    CHECK (
      uploaded_at IS NULL
      OR status <> 'initiated'
    ),
  CONSTRAINT cloud_upload_sessions_completed_at_chk
    CHECK (
      (status = 'completed' AND completed_at IS NOT NULL)
      OR (status <> 'completed' AND completed_at IS NULL)
    ),
  CONSTRAINT cloud_upload_sessions_failure_chk
    CHECK (
      (status = 'failed' AND failure_code IS NOT NULL)
      OR (status <> 'failed' AND failure_code IS NULL AND failure_detail IS NULL)
    )
);

COMMENT ON TABLE cloud.upload_sessions IS
  'Idempotent upload reservation and presigned/multipart upload lifecycle';
COMMENT ON COLUMN cloud.upload_sessions.reserved_bytes IS
  'Quota held before the client receives upload URLs';

CREATE INDEX cloud_upload_sessions_live_expiry_idx
  ON cloud.upload_sessions (expires_at, id)
  WHERE status IN ('initiated', 'uploaded', 'completing');

CREATE INDEX cloud_upload_sessions_drive_created_idx
  ON cloud.upload_sessions (drive_id, created_at DESC);

CREATE INDEX cloud_upload_sessions_item_idx
  ON cloud.upload_sessions (item_id, created_at DESC);

CREATE TRIGGER cloud_upload_sessions_set_updated_at
  BEFORE UPDATE ON cloud.upload_sessions
  FOR EACH ROW
  EXECUTE FUNCTION cloud.set_updated_at();

CREATE TABLE cloud.upload_parts (
  upload_session_id UUID NOT NULL,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  checksum_sha256 CHAR(64),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (upload_session_id, part_number),
  CONSTRAINT cloud_upload_parts_session_fkey
    FOREIGN KEY (upload_session_id)
    REFERENCES cloud.upload_sessions(id)
    ON DELETE CASCADE,
  CONSTRAINT cloud_upload_parts_part_number_chk
    CHECK (part_number BETWEEN 1 AND 10000),
  CONSTRAINT cloud_upload_parts_etag_not_blank_chk
    CHECK (btrim(etag) <> ''),
  CONSTRAINT cloud_upload_parts_size_chk
    CHECK (size_bytes > 0),
  CONSTRAINT cloud_upload_parts_checksum_chk
    CHECK (
      checksum_sha256 IS NULL
      OR checksum_sha256 ~ '^[0-9a-f]{64}$'
    )
);

COMMENT ON TABLE cloud.upload_parts IS
  'Completed multipart chunks; optional for Phase 1 single-part uploads';

CREATE TABLE cloud.quotas (
  drive_id UUID PRIMARY KEY,
  quota_bytes BIGINT NOT NULL DEFAULT 5368709120,
  used_bytes BIGINT NOT NULL DEFAULT 0,
  reserved_bytes BIGINT NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cloud_quotas_drive_fkey
    FOREIGN KEY (drive_id)
    REFERENCES cloud.drives(id)
    ON DELETE CASCADE,
  CONSTRAINT cloud_quotas_limit_chk
    CHECK (quota_bytes > 0),
  CONSTRAINT cloud_quotas_used_chk
    CHECK (used_bytes >= 0),
  CONSTRAINT cloud_quotas_reserved_chk
    CHECK (reserved_bytes >= 0),
  CONSTRAINT cloud_quotas_capacity_chk
    CHECK (used_bytes + reserved_bytes <= quota_bytes),
  CONSTRAINT cloud_quotas_version_chk
    CHECK (version > 0)
);

COMMENT ON TABLE cloud.quotas IS
  'Current quota snapshot; default 5 GiB per personal drive';
COMMENT ON CONSTRAINT cloud_quotas_capacity_chk ON cloud.quotas IS
  'Final database guard against concurrent reservations exceeding quota';

CREATE TRIGGER cloud_quotas_set_updated_at
  BEFORE UPDATE ON cloud.quotas
  FOR EACH ROW
  EXECUTE FUNCTION cloud.set_updated_at();

CREATE TABLE cloud.usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id UUID NOT NULL,
  item_id UUID,
  upload_session_id UUID,
  event_type cloud.quota_event_type NOT NULL,
  delta_used_bytes BIGINT NOT NULL DEFAULT 0,
  delta_reserved_bytes BIGINT NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(160) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cloud_usage_ledger_drive_fkey
    FOREIGN KEY (drive_id)
    REFERENCES cloud.drives(id)
    ON DELETE RESTRICT,
  CONSTRAINT cloud_usage_ledger_item_drive_fkey
    FOREIGN KEY (item_id, drive_id)
    REFERENCES cloud.items(id, drive_id)
    ON DELETE SET NULL (item_id),
  CONSTRAINT cloud_usage_ledger_upload_drive_fkey
    FOREIGN KEY (upload_session_id, drive_id)
    REFERENCES cloud.upload_sessions(id, drive_id)
    ON DELETE SET NULL (upload_session_id),
  CONSTRAINT cloud_usage_ledger_idempotency_uq
    UNIQUE (drive_id, idempotency_key),
  CONSTRAINT cloud_usage_ledger_idempotency_not_blank_chk
    CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT cloud_usage_ledger_metadata_object_chk
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT cloud_usage_ledger_non_zero_chk
    CHECK (delta_used_bytes <> 0 OR delta_reserved_bytes <> 0),
  CONSTRAINT cloud_usage_ledger_event_delta_chk
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
    )
);

COMMENT ON TABLE cloud.usage_ledger IS
  'Append-only idempotent quota event history used for reconciliation';

CREATE INDEX cloud_usage_ledger_drive_created_idx
  ON cloud.usage_ledger (drive_id, created_at DESC, id DESC);

CREATE INDEX cloud_usage_ledger_item_idx
  ON cloud.usage_ledger (item_id, created_at DESC)
  WHERE item_id IS NOT NULL;

COMMIT;
