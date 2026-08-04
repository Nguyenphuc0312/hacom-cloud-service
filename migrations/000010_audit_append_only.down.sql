BEGIN;

DROP TRIGGER IF EXISTS cloud_audit_logs_reject_mutation ON cloud.audit_logs;
DROP FUNCTION IF EXISTS cloud.reject_audit_log_mutation();

COMMIT;
