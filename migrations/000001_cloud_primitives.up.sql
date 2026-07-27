BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS cloud;

CREATE TYPE cloud.drive_status AS ENUM (
  'active',
  'suspended',
  'archived'
);

CREATE TYPE cloud.item_type AS ENUM (
  'text',
  'link',
  'file',
  'image',
  'video',
  'audio'
);

CREATE TYPE cloud.item_status AS ENUM (
  'pending',
  'processing',
  'ready',
  'failed',
  'trashed'
);

CREATE TYPE cloud.object_status AS ENUM (
  'reserved',
  'uploaded',
  'processing',
  'ready',
  'quarantined',
  'delete_pending',
  'deleted',
  'failed'
);

CREATE TYPE cloud.scan_status AS ENUM (
  'not_scanned',
  'pending',
  'clean',
  'infected',
  'error'
);

CREATE TYPE cloud.upload_status AS ENUM (
  'initiated',
  'uploaded',
  'completing',
  'completed',
  'expired',
  'cancelled',
  'failed'
);

CREATE TYPE cloud.quota_event_type AS ENUM (
  'reserve',
  'commit',
  'release',
  'consume',
  'purge',
  'reconcile'
);

CREATE TYPE cloud.job_type AS ENUM (
  'verify_upload',
  'hash_file',
  'virus_scan',
  'create_thumbnail',
  'cleanup_expired_upload',
  'permanent_delete',
  'reconcile_quota'
);

CREATE TYPE cloud.job_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'dead'
);

CREATE OR REPLACE FUNCTION cloud.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON SCHEMA cloud IS
  'Persistence owned exclusively by hacom-cloud-service';
COMMENT ON FUNCTION cloud.set_updated_at() IS
  'Canonical trigger function for mutable Cloud records';

COMMIT;
