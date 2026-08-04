BEGIN;

CREATE TABLE cloud.drives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  name VARCHAR(120) NOT NULL DEFAULT 'My Cloud',
  status cloud.drive_status NOT NULL DEFAULT 'active',
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cloud_drives_owner_user_uq UNIQUE (owner_user_id),
  CONSTRAINT cloud_drives_name_not_blank_chk
    CHECK (btrim(name) <> ''),
  CONSTRAINT cloud_drives_archive_state_chk
    CHECK (
      (status = 'archived' AND archived_at IS NOT NULL)
      OR (status <> 'archived' AND archived_at IS NULL)
    )
);

COMMENT ON TABLE cloud.drives IS
  'One personal Cloud root per Auth user; this is not a folder';
COMMENT ON COLUMN cloud.drives.owner_user_id IS
  'Soft UUID reference to auth.users.id; no cross-service foreign key';

CREATE INDEX cloud_drives_status_idx
  ON cloud.drives (status, created_at DESC);

CREATE TRIGGER cloud_drives_set_updated_at
  BEFORE UPDATE ON cloud.drives
  FOR EACH ROW
  EXECUTE FUNCTION cloud.set_updated_at();

CREATE TABLE cloud.storage_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id UUID NOT NULL,
  bucket VARCHAR(255) NOT NULL,
  object_key TEXT NOT NULL,
  original_name VARCHAR(1024) NOT NULL,
  content_type VARCHAR(255) NOT NULL,
  declared_size_bytes BIGINT NOT NULL,
  actual_size_bytes BIGINT,
  checksum_sha256 CHAR(64),
  etag TEXT,
  status cloud.object_status NOT NULL DEFAULT 'reserved',
  scan_status cloud.scan_status NOT NULL DEFAULT 'not_scanned',
  uploaded_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  delete_requested_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cloud_storage_objects_drive_fkey
    FOREIGN KEY (drive_id)
    REFERENCES cloud.drives(id)
    ON DELETE RESTRICT,
  CONSTRAINT cloud_storage_objects_id_drive_uq
    UNIQUE (id, drive_id),
  CONSTRAINT cloud_storage_objects_location_uq
    UNIQUE (bucket, object_key),
  CONSTRAINT cloud_storage_objects_bucket_not_blank_chk
    CHECK (btrim(bucket) <> ''),
  CONSTRAINT cloud_storage_objects_key_chk
    CHECK (
      btrim(object_key) <> ''
      AND object_key !~ '^/'
      AND char_length(object_key) <= 1024
    ),
  CONSTRAINT cloud_storage_objects_name_not_blank_chk
    CHECK (btrim(original_name) <> ''),
  CONSTRAINT cloud_storage_objects_content_type_not_blank_chk
    CHECK (btrim(content_type) <> ''),
  CONSTRAINT cloud_storage_objects_declared_size_chk
    CHECK (declared_size_bytes BETWEEN 1 AND 100000000),
  CONSTRAINT cloud_storage_objects_actual_size_chk
    CHECK (
      actual_size_bytes IS NULL
      OR actual_size_bytes BETWEEN 1 AND 100000000
    ),
  CONSTRAINT cloud_storage_objects_checksum_chk
    CHECK (
      checksum_sha256 IS NULL
      OR checksum_sha256 ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT cloud_storage_objects_uploaded_state_chk
    CHECK (
      uploaded_at IS NULL
      OR status IN (
        'uploaded',
        'processing',
        'ready',
        'quarantined',
        'delete_pending',
        'deleted',
        'failed'
      )
    ),
  CONSTRAINT cloud_storage_objects_delete_requested_state_chk
    CHECK (
      delete_requested_at IS NULL
      OR status IN ('delete_pending', 'deleted')
    ),
  CONSTRAINT cloud_storage_objects_deleted_state_chk
    CHECK (
      (status = 'deleted' AND deleted_at IS NOT NULL)
      OR (status <> 'deleted' AND deleted_at IS NULL)
    )
);

COMMENT ON TABLE cloud.storage_objects IS
  'Metadata for binary objects stored in MinIO; PostgreSQL never stores file bytes';
COMMENT ON COLUMN cloud.storage_objects.checksum_sha256 IS
  'Lowercase SHA-256 hex; intentionally non-unique until deduplication policy is approved';

CREATE INDEX cloud_storage_objects_drive_created_idx
  ON cloud.storage_objects (drive_id, created_at DESC);

CREATE INDEX cloud_storage_objects_status_idx
  ON cloud.storage_objects (status, created_at);

CREATE INDEX cloud_storage_objects_checksum_idx
  ON cloud.storage_objects (checksum_sha256)
  WHERE checksum_sha256 IS NOT NULL;

CREATE INDEX cloud_storage_objects_delete_pending_idx
  ON cloud.storage_objects (delete_requested_at)
  WHERE status = 'delete_pending';

CREATE TRIGGER cloud_storage_objects_set_updated_at
  BEFORE UPDATE ON cloud.storage_objects
  FOR EACH ROW
  EXECUTE FUNCTION cloud.set_updated_at();

CREATE TABLE cloud.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id UUID NOT NULL,
  item_type cloud.item_type NOT NULL,
  status cloud.item_status NOT NULL DEFAULT 'pending',
  title VARCHAR(512),
  text_content TEXT,
  link_url TEXT,
  storage_object_id UUID,
  size_bytes BIGINT NOT NULL,
  billable_bytes BIGINT NOT NULL,
  source_type VARCHAR(32) NOT NULL DEFAULT 'manual',
  source_service VARCHAR(64),
  source_entity_type VARCHAR(64),
  source_entity_id TEXT,
  idempotency_key VARCHAR(128),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  purge_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cloud_items_drive_fkey
    FOREIGN KEY (drive_id)
    REFERENCES cloud.drives(id)
    ON DELETE RESTRICT,
  CONSTRAINT cloud_items_id_drive_uq
    UNIQUE (id, drive_id),
  CONSTRAINT cloud_items_storage_object_drive_fkey
    FOREIGN KEY (storage_object_id, drive_id)
    REFERENCES cloud.storage_objects(id, drive_id)
    ON DELETE RESTRICT,
  CONSTRAINT cloud_items_title_not_blank_chk
    CHECK (title IS NULL OR btrim(title) <> ''),
  CONSTRAINT cloud_items_size_chk
    CHECK (size_bytes BETWEEN 1 AND 100000000),
  CONSTRAINT cloud_items_billable_size_chk
    CHECK (billable_bytes BETWEEN 1 AND 100000000),
  CONSTRAINT cloud_items_source_type_chk
    CHECK (
      source_type IN (
        'manual',
        'cloud_upload',
        'chat_copy',
        'import',
        'ai_generated'
      )
    ),
  CONSTRAINT cloud_items_source_reference_chk
    CHECK (
      (
        source_service IS NULL
        AND source_entity_type IS NULL
        AND source_entity_id IS NULL
      )
      OR (
        source_service IS NOT NULL
        AND source_entity_type IS NOT NULL
        AND source_entity_id IS NOT NULL
      )
    ),
  CONSTRAINT cloud_items_metadata_object_chk
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT cloud_items_content_shape_chk
    CHECK (
      (
        item_type = 'text'
        AND text_content IS NOT NULL
        AND btrim(text_content) <> ''
        AND link_url IS NULL
        AND storage_object_id IS NULL
      )
      OR (
        item_type = 'link'
        AND link_url IS NOT NULL
        AND btrim(link_url) <> ''
        AND storage_object_id IS NULL
      )
      OR (
        item_type IN ('file', 'image', 'video', 'audio')
        AND storage_object_id IS NOT NULL
        AND text_content IS NULL
        AND link_url IS NULL
      )
    ),
  CONSTRAINT cloud_items_trash_state_chk
    CHECK (
      (
        status = 'trashed'
        AND deleted_at IS NOT NULL
        AND purge_after IS NOT NULL
        AND purge_after > deleted_at
      )
      OR (
        status <> 'trashed'
        AND deleted_at IS NULL
        AND purge_after IS NULL
      )
    )
);

COMMENT ON TABLE cloud.items IS
  'Logical timeline items: text, link, or a reference to a MinIO-backed object';
COMMENT ON COLUMN cloud.items.billable_bytes IS
  'Logical bytes charged to the owner quota; Phase 1 equals content/file size';
COMMENT ON COLUMN cloud.items.source_entity_id IS
  'Soft external reference for future Chat copy/import; never a cross-database FK';

CREATE UNIQUE INDEX cloud_items_idempotency_uq
  ON cloud.items (drive_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX cloud_items_timeline_idx
  ON cloud.items (drive_id, created_at DESC, id DESC)
  WHERE status <> 'trashed';

CREATE INDEX cloud_items_trash_idx
  ON cloud.items (drive_id, purge_after, id)
  WHERE status = 'trashed';

CREATE INDEX cloud_items_storage_object_idx
  ON cloud.items (storage_object_id)
  WHERE storage_object_id IS NOT NULL;

CREATE INDEX cloud_items_source_reference_idx
  ON cloud.items (source_service, source_entity_type, source_entity_id)
  WHERE source_entity_id IS NOT NULL;

CREATE TRIGGER cloud_items_set_updated_at
  BEFORE UPDATE ON cloud.items
  FOR EACH ROW
  EXECUTE FUNCTION cloud.set_updated_at();

COMMIT;
