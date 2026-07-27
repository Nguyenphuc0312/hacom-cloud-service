BEGIN;

DROP FUNCTION IF EXISTS cloud.set_updated_at();

DROP TYPE IF EXISTS cloud.job_status;
DROP TYPE IF EXISTS cloud.job_type;
DROP TYPE IF EXISTS cloud.quota_event_type;
DROP TYPE IF EXISTS cloud.upload_status;
DROP TYPE IF EXISTS cloud.scan_status;
DROP TYPE IF EXISTS cloud.object_status;
DROP TYPE IF EXISTS cloud.item_status;
DROP TYPE IF EXISTS cloud.item_type;
DROP TYPE IF EXISTS cloud.drive_status;

DROP SCHEMA IF EXISTS cloud;

COMMIT;
