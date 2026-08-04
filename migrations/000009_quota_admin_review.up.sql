BEGIN;

ALTER TABLE cloud.quota_requests
  ADD COLUMN review_operation_id VARCHAR(128);

UPDATE cloud.quota_requests
SET review_operation_id = 'baseline:' || id::text
WHERE status IN ('approved', 'rejected')
  AND review_operation_id IS NULL;

ALTER TABLE cloud.quota_requests
  ADD CONSTRAINT cloud_quota_requests_review_operation_not_blank_chk
    CHECK (review_operation_id IS NULL OR btrim(review_operation_id) <> ''),
  ADD CONSTRAINT cloud_quota_requests_review_operation_state_chk
    CHECK (
      (status = 'pending' AND review_operation_id IS NULL)
      OR (status IN ('approved', 'rejected') AND review_operation_id IS NOT NULL)
    );

CREATE INDEX cloud_quota_requests_admin_list_idx
  ON cloud.quota_requests (status, created_at DESC, id DESC);

COMMENT ON COLUMN cloud.quota_requests.review_operation_id IS
  'Admin Service idempotency key for an approve/reject decision; never reused to apply quota twice';

COMMIT;
