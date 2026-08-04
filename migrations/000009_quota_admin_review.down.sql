BEGIN;

DROP INDEX IF EXISTS cloud.cloud_quota_requests_admin_list_idx;
ALTER TABLE cloud.quota_requests
  DROP CONSTRAINT IF EXISTS cloud_quota_requests_review_operation_state_chk,
  DROP CONSTRAINT IF EXISTS cloud_quota_requests_review_operation_not_blank_chk,
  DROP COLUMN IF EXISTS review_operation_id;

COMMIT;
