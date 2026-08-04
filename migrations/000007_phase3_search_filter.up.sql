BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

ALTER TABLE cloud.items
  ADD COLUMN search_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN search_vector TSVECTOR
    GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED;

CREATE FUNCTION cloud.refresh_item_search_text()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  file_name TEXT;
BEGIN
  IF NEW.storage_object_id IS NOT NULL THEN
    SELECT original_name
    INTO file_name
    FROM cloud.storage_objects
    WHERE id = NEW.storage_object_id
      AND drive_id = NEW.drive_id;
  END IF;

  NEW.search_text := concat_ws(
    ' ',
    NULLIF(btrim(NEW.title), ''),
    NULLIF(btrim(NEW.text_content), ''),
    NULLIF(btrim(NEW.link_url), ''),
    NULLIF(btrim(file_name), '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER cloud_items_refresh_search_text
  BEFORE INSERT OR UPDATE OF
    drive_id, title, text_content, link_url, storage_object_id
  ON cloud.items
  FOR EACH ROW
  EXECUTE FUNCTION cloud.refresh_item_search_text();

CREATE FUNCTION cloud.refresh_file_item_search_text()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE cloud.items AS item
  SET search_text = concat_ws(
    ' ',
    NULLIF(btrim(item.title), ''),
    NULLIF(btrim(item.text_content), ''),
    NULLIF(btrim(item.link_url), ''),
    NULLIF(btrim(NEW.original_name), '')
  )
  WHERE item.storage_object_id = NEW.id
    AND item.drive_id = NEW.drive_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cloud_storage_objects_refresh_item_search_text
  AFTER UPDATE OF original_name
  ON cloud.storage_objects
  FOR EACH ROW
  WHEN (OLD.original_name IS DISTINCT FROM NEW.original_name)
  EXECUTE FUNCTION cloud.refresh_file_item_search_text();

UPDATE cloud.items AS item
SET search_text = concat_ws(
  ' ',
  NULLIF(btrim(item.title), ''),
  NULLIF(btrim(item.text_content), ''),
  NULLIF(btrim(item.link_url), ''),
  NULLIF(btrim(object.original_name), '')
)
FROM cloud.storage_objects AS object
WHERE object.id = item.storage_object_id
  AND object.drive_id = item.drive_id;

UPDATE cloud.items AS item
SET search_text = concat_ws(
  ' ',
  NULLIF(btrim(item.title), ''),
  NULLIF(btrim(item.text_content), ''),
  NULLIF(btrim(item.link_url), '')
)
WHERE item.storage_object_id IS NULL;

CREATE INDEX cloud_items_search_vector_idx
  ON cloud.items USING GIN (drive_id, search_vector);

CREATE INDEX cloud_items_search_trgm_idx
  ON cloud.items USING GIN (drive_id, search_text gin_trgm_ops);

CREATE INDEX cloud_items_active_type_timeline_idx
  ON cloud.items (drive_id, item_type, created_at DESC, id DESC)
  WHERE status <> 'trashed';

CREATE INDEX cloud_items_trash_type_timeline_idx
  ON cloud.items (drive_id, item_type, created_at DESC, id DESC)
  WHERE status = 'trashed';

COMMENT ON COLUMN cloud.items.search_text IS
  'Denormalized owner-scoped search document: title, text, link URL, and original file name';
COMMENT ON COLUMN cloud.items.search_vector IS
  'Simple-language full-text vector generated from search_text';

COMMIT;
