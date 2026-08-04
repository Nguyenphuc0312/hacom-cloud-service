BEGIN;

-- Stabilize the Phase 1 snapshot while trash_bytes is derived from items.
-- ACCESS EXCLUSIVE is already required by ALTER TABLE on quotas; the explicit
-- item lock prevents a concurrent manual status update during the backfill.
LOCK TABLE cloud.items IN SHARE MODE;
LOCK TABLE cloud.quotas IN ACCESS EXCLUSIVE MODE;

ALTER TABLE cloud.quotas
  ADD COLUMN trash_bytes BIGINT;

UPDATE cloud.quotas AS quota
SET trash_bytes = COALESCE(trash.total_bytes, 0)
FROM (
  SELECT
    drive.id AS drive_id,
    SUM(item.billable_bytes) FILTER (WHERE item.status = 'trashed') AS total_bytes
  FROM cloud.drives AS drive
  LEFT JOIN cloud.items AS item
    ON item.drive_id = drive.id
  GROUP BY drive.id
) AS trash
WHERE trash.drive_id = quota.drive_id;

-- Every Phase 1 quota row is covered by the drives foreign key, but retain an
-- explicit fallback so the NOT NULL transition is safe if constraints were
-- temporarily deferred by an operator.
UPDATE cloud.quotas
SET trash_bytes = 0
WHERE trash_bytes IS NULL;

DO $$
DECLARE
  invalid_drive_id UUID;
  invalid_used_bytes BIGINT;
  invalid_trash_bytes BIGINT;
BEGIN
  SELECT drive_id, used_bytes, trash_bytes
  INTO invalid_drive_id, invalid_used_bytes, invalid_trash_bytes
  FROM cloud.quotas
  WHERE trash_bytes > used_bytes
  ORDER BY drive_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = format(
        'Phase 2 quota backfill rejected drive %s: trash_bytes (%s) exceeds used_bytes (%s)',
        invalid_drive_id,
        invalid_trash_bytes,
        invalid_used_bytes
      ),
      HINT = 'Reconcile the Phase 1 quota snapshot before retrying migration 000005; used_bytes must include active and trashed items.';
  END IF;
END;
$$;

ALTER TABLE cloud.quotas
  ALTER COLUMN trash_bytes SET DEFAULT 0,
  ALTER COLUMN trash_bytes SET NOT NULL,
  ADD CONSTRAINT cloud_quotas_trash_chk
    CHECK (trash_bytes >= 0),
  ADD CONSTRAINT cloud_quotas_trash_within_used_chk
    CHECK (trash_bytes <= used_bytes);

COMMENT ON COLUMN cloud.quotas.used_bytes IS
  'Total billable bytes for active and trashed items; retained for Phase 1 compatibility';
COMMENT ON COLUMN cloud.quotas.trash_bytes IS
  'Billable bytes held by trashed items; active bytes equal used_bytes - trash_bytes';

-- A dedicated type is intentionally used instead of extending a Phase 1 enum:
-- PostgreSQL enum values cannot be removed safely during a normal rollback.
CREATE TYPE cloud.quota_request_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);

CREATE TABLE cloud.quota_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id UUID NOT NULL,
  requested_by_user_id UUID NOT NULL,
  status cloud.quota_request_status NOT NULL DEFAULT 'pending',
  current_quota_bytes BIGINT NOT NULL,
  requested_quota_bytes BIGINT NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  reason VARCHAR(1000),
  reviewed_by_user_id UUID,
  review_note VARCHAR(1000),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cloud_quota_requests_drive_fkey
    FOREIGN KEY (drive_id)
    REFERENCES cloud.drives(id)
    ON DELETE CASCADE,
  CONSTRAINT cloud_quota_requests_idempotency_uq
    UNIQUE (drive_id, idempotency_key),
  CONSTRAINT cloud_quota_requests_current_quota_chk
    CHECK (current_quota_bytes > 0),
  CONSTRAINT cloud_quota_requests_increase_chk
    CHECK (requested_quota_bytes > current_quota_bytes),
  CONSTRAINT cloud_quota_requests_idempotency_not_blank_chk
    CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT cloud_quota_requests_reason_not_blank_chk
    CHECK (reason IS NULL OR btrim(reason) <> ''),
  CONSTRAINT cloud_quota_requests_review_note_not_blank_chk
    CHECK (review_note IS NULL OR btrim(review_note) <> ''),
  CONSTRAINT cloud_quota_requests_review_state_chk
    CHECK (
      (
        status = 'pending'
        AND reviewed_by_user_id IS NULL
        AND reviewed_at IS NULL
        AND review_note IS NULL
      )
      OR (
        status IN ('approved', 'rejected')
        AND reviewed_by_user_id IS NOT NULL
        AND reviewed_at IS NOT NULL
      )
    )
);

COMMENT ON TABLE cloud.quota_requests IS
  'Phase 2 quota increase requests; quota changes remain owned by Cloud Service transactions';
COMMENT ON COLUMN cloud.quota_requests.requested_by_user_id IS
  'Soft UUID reference to the Auth user; deliberately has no cross-service foreign key';
COMMENT ON COLUMN cloud.quota_requests.current_quota_bytes IS
  'Immutable quota snapshot captured when the request is created';

CREATE UNIQUE INDEX cloud_quota_requests_one_pending_per_drive_uq
  ON cloud.quota_requests (drive_id)
  WHERE status = 'pending';

CREATE INDEX cloud_quota_requests_drive_created_idx
  ON cloud.quota_requests (drive_id, created_at DESC, id DESC);

CREATE INDEX cloud_quota_requests_pending_review_idx
  ON cloud.quota_requests (created_at, id)
  WHERE status = 'pending';

CREATE TRIGGER cloud_quota_requests_set_updated_at
  BEFORE UPDATE ON cloud.quota_requests
  FOR EACH ROW
  EXECUTE FUNCTION cloud.set_updated_at();

COMMIT;
