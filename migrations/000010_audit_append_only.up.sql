BEGIN;

CREATE OR REPLACE FUNCTION cloud.reject_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('cloud.audit_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'cloud.audit_logs is append-only',
    HINT = 'Use a privileged transaction with SET LOCAL cloud.audit_maintenance = on for approved retention maintenance only.';
END;
$$;

CREATE TRIGGER cloud_audit_logs_reject_mutation
  BEFORE UPDATE OR DELETE ON cloud.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION cloud.reject_audit_log_mutation();

COMMENT ON FUNCTION cloud.reject_audit_log_mutation() IS
  'Rejects audit UPDATE/DELETE unless an explicitly scoped maintenance transaction enables cloud.audit_maintenance';

COMMIT;
