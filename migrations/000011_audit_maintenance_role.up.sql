BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cloud_audit_maintainer') THEN
    CREATE ROLE cloud_audit_maintainer NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA cloud TO cloud_audit_maintainer;
GRANT DELETE ON cloud.audit_logs TO cloud_audit_maintainer;

CREATE OR REPLACE FUNCTION cloud.reject_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'cloud_audit_maintainer'
     AND current_setting('cloud.audit_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'cloud.audit_logs is append-only',
    HINT = 'Use the restricted cloud.purge_audit_logs_before procedure for approved retention maintenance.';
END;
$$;

CREATE OR REPLACE FUNCTION cloud.purge_audit_logs_before(p_before TIMESTAMPTZ)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cloud
AS $$
DECLARE
  deleted_count BIGINT;
BEGIN
  IF p_before IS NULL OR p_before >= NOW() THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='audit retention cutoff must be in the past';
  END IF;
  PERFORM set_config('cloud.audit_maintenance', 'on', true);
  DELETE FROM cloud.audit_logs WHERE occurred_at < p_before;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

ALTER FUNCTION cloud.purge_audit_logs_before(TIMESTAMPTZ) OWNER TO cloud_audit_maintainer;
REVOKE ALL ON FUNCTION cloud.purge_audit_logs_before(TIMESTAMPTZ) FROM PUBLIC;

COMMENT ON FUNCTION cloud.purge_audit_logs_before(TIMESTAMPTZ) IS
  'Restricted retention boundary; grant cloud_audit_maintainer only to the audited maintenance identity';

COMMIT;
