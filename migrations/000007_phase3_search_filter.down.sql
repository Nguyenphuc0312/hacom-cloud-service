BEGIN;

DROP INDEX IF EXISTS cloud.cloud_items_trash_type_timeline_idx;
DROP INDEX IF EXISTS cloud.cloud_items_active_type_timeline_idx;
DROP INDEX IF EXISTS cloud.cloud_items_search_trgm_idx;
DROP INDEX IF EXISTS cloud.cloud_items_search_vector_idx;

DROP TRIGGER IF EXISTS cloud_storage_objects_refresh_item_search_text ON cloud.storage_objects;
DROP FUNCTION IF EXISTS cloud.refresh_file_item_search_text();
DROP TRIGGER IF EXISTS cloud_items_refresh_search_text ON cloud.items;
DROP FUNCTION IF EXISTS cloud.refresh_item_search_text();

ALTER TABLE cloud.items
  DROP COLUMN IF EXISTS search_vector,
  DROP COLUMN IF EXISTS search_text;

-- Extensions are database-wide capabilities and may be shared by other schemas.
-- Keep pg_trgm and btree_gin installed during rollback, like 000001 keeps pgcrypto.

COMMIT;
