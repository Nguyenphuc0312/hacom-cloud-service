\set ON_ERROR_STOP on

DO $$
BEGIN
  IF to_regclass('cloud.quota_requests') IS NOT NULL THEN
    RAISE EXCEPTION 'quota_requests table survived migration down';
  END IF;
  IF to_regtype('cloud.quota_request_status') IS NOT NULL THEN
    RAISE EXCEPTION 'quota_request_status type survived migration down';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'cloud'
      AND table_name = 'quotas'
      AND column_name = 'trash_bytes'
  ) THEN
    RAISE EXCEPTION 'trash_bytes column survived migration down';
  END IF;
END;
$$;
