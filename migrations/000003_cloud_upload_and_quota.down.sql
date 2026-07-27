BEGIN;

DROP TABLE IF EXISTS cloud.usage_ledger;
DROP TABLE IF EXISTS cloud.quotas;
DROP TABLE IF EXISTS cloud.upload_parts;
DROP TABLE IF EXISTS cloud.upload_sessions;

COMMIT;
