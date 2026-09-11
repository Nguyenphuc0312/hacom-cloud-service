BEGIN;

ALTER TYPE cloud.job_status ADD VALUE IF NOT EXISTS 'cancelled';

COMMIT;
