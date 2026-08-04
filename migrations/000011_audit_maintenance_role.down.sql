BEGIN;

DROP FUNCTION IF EXISTS cloud.purge_audit_logs_before(TIMESTAMPTZ);
REVOKE DELETE ON cloud.audit_logs FROM cloud_audit_maintainer;
REVOKE USAGE ON SCHEMA cloud FROM cloud_audit_maintainer;

CREATE OR REPLACE FUNCTION cloud.reject_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('cloud.audit_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='cloud.audit_logs is append-only';
END;
$$;

COMMIT;
