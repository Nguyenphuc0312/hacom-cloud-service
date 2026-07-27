BEGIN;

CREATE TABLE cloud.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type cloud.job_type NOT NULL,
  status cloud.job_status NOT NULL DEFAULT 'pending',
  drive_id UUID NOT NULL,
  item_id UUID,
  storage_object_id UUID,
  upload_session_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority SMALLINT NOT NULL DEFAULT 100,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by VARCHAR(128),
  locked_at TIMESTAMPTZ,
  last_error TEXT,
  dedupe_key VARCHAR(160),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cloud_jobs_drive_fkey
    FOREIGN KEY (drive_id)
    REFERENCES cloud.drives(id)
    ON DELETE RESTRICT,
  CONSTRAINT cloud_jobs_item_drive_fkey
    FOREIGN KEY (item_id, drive_id)
    REFERENCES cloud.items(id, drive_id)
    ON DELETE SET NULL (item_id),
  CONSTRAINT cloud_jobs_object_drive_fkey
    FOREIGN KEY (storage_object_id, drive_id)
    REFERENCES cloud.storage_objects(id, drive_id)
    ON DELETE SET NULL (storage_object_id),
  CONSTRAINT cloud_jobs_upload_drive_fkey
    FOREIGN KEY (upload_session_id, drive_id)
    REFERENCES cloud.upload_sessions(id, drive_id)
    ON DELETE SET NULL (upload_session_id),
  CONSTRAINT cloud_jobs_payload_object_chk
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT cloud_jobs_priority_chk
    CHECK (priority BETWEEN 0 AND 1000),
  CONSTRAINT cloud_jobs_attempts_chk
    CHECK (attempts >= 0 AND attempts <= max_attempts),
  CONSTRAINT cloud_jobs_max_attempts_chk
    CHECK (max_attempts BETWEEN 1 AND 100),
  CONSTRAINT cloud_jobs_lock_state_chk
    CHECK (
      (locked_by IS NULL AND locked_at IS NULL)
      OR (locked_by IS NOT NULL AND locked_at IS NOT NULL)
    ),
  CONSTRAINT cloud_jobs_completed_state_chk
    CHECK (
      (status = 'completed' AND completed_at IS NOT NULL)
      OR (status <> 'completed' AND completed_at IS NULL)
    ),
  CONSTRAINT cloud_jobs_dedupe_not_blank_chk
    CHECK (dedupe_key IS NULL OR btrim(dedupe_key) <> '')
);

COMMENT ON TABLE cloud.jobs IS
  'PostgreSQL-backed Phase 1 worker queue; claim with FOR UPDATE SKIP LOCKED';

CREATE UNIQUE INDEX cloud_jobs_active_dedupe_uq
  ON cloud.jobs (job_type, dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND status IN ('pending', 'processing', 'failed');

CREATE INDEX cloud_jobs_claim_idx
  ON cloud.jobs (priority, run_after, created_at, id)
  WHERE status IN ('pending', 'failed');

CREATE INDEX cloud_jobs_stale_lock_idx
  ON cloud.jobs (locked_at)
  WHERE status = 'processing';

CREATE INDEX cloud_jobs_item_idx
  ON cloud.jobs (item_id, created_at DESC)
  WHERE item_id IS NOT NULL;

CREATE TRIGGER cloud_jobs_set_updated_at
  BEFORE UPDATE ON cloud.jobs
  FOR EACH ROW
  EXECUTE FUNCTION cloud.set_updated_at();

CREATE TABLE cloud.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id UUID,
  actor_type VARCHAR(24) NOT NULL DEFAULT 'user',
  request_id VARCHAR(128),
  action VARCHAR(96) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id UUID,
  drive_id UUID,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT cloud_audit_logs_drive_fkey
    FOREIGN KEY (drive_id)
    REFERENCES cloud.drives(id)
    ON DELETE SET NULL,
  CONSTRAINT cloud_audit_logs_actor_type_chk
    CHECK (actor_type IN ('user', 'admin', 'service', 'worker', 'system')),
  CONSTRAINT cloud_audit_logs_action_not_blank_chk
    CHECK (btrim(action) <> ''),
  CONSTRAINT cloud_audit_logs_entity_type_not_blank_chk
    CHECK (btrim(entity_type) <> ''),
  CONSTRAINT cloud_audit_logs_metadata_object_chk
    CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE cloud.audit_logs IS
  'Append-only security and lifecycle audit trail without sensitive file content';
COMMENT ON COLUMN cloud.audit_logs.actor_user_id IS
  'Soft UUID reference to Auth; null for system/worker events';

CREATE INDEX cloud_audit_logs_drive_time_idx
  ON cloud.audit_logs (drive_id, occurred_at DESC, id DESC)
  WHERE drive_id IS NOT NULL;

CREATE INDEX cloud_audit_logs_actor_time_idx
  ON cloud.audit_logs (actor_user_id, occurred_at DESC, id DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX cloud_audit_logs_entity_idx
  ON cloud.audit_logs (entity_type, entity_id, occurred_at DESC)
  WHERE entity_id IS NOT NULL;

CREATE INDEX cloud_audit_logs_request_idx
  ON cloud.audit_logs (request_id)
  WHERE request_id IS NOT NULL;

COMMIT;
