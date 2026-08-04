BEGIN;

DROP TABLE IF EXISTS cloud.quota_requests;
DROP TYPE IF EXISTS cloud.quota_request_status;

ALTER TABLE cloud.quotas
  DROP CONSTRAINT IF EXISTS cloud_quotas_trash_within_used_chk,
  DROP CONSTRAINT IF EXISTS cloud_quotas_trash_chk,
  DROP COLUMN IF EXISTS trash_bytes;

COMMENT ON COLUMN cloud.quotas.used_bytes IS NULL;

COMMIT;
