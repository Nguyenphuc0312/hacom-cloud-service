\set ON_ERROR_STOP on
\timing on

SET statement_timeout = '2s';

-- Repository first resolves this drive by the unique owner_user_id index.
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)
SELECT id
FROM cloud.drives
WHERE owner_user_id = '31000000-0000-4000-8000-000000000001';

-- Active search: same indexed predicate and stable timeline order as ListItems.
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)
SELECT item.id, item.created_at
FROM cloud.items AS item
WHERE item.drive_id = '30000000-0000-4000-8000-000000000001'
  AND item.status <> 'trashed'
  AND (
    item.search_vector @@ websearch_to_tsquery('simple', 'quarterly needle')
    OR item.search_text ILIKE '%' || 'quarterly needle' || '%'
  )
ORDER BY item.created_at DESC, item.id DESC
LIMIT 21;
-- Trash search plus type/date filtering.
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)
SELECT item.id, item.created_at
FROM cloud.items AS item
WHERE item.drive_id = '30000000-0000-4000-8000-000000000001'
  AND item.status = 'trashed'
  AND (
    item.search_vector @@ websearch_to_tsquery('simple', 'quarterly needle')
    OR item.search_text ILIKE '%' || 'quarterly needle' || '%'
  )
  AND item.item_type = 'text'
  AND item.created_at >= NOW() - interval '2 days'
  AND item.created_at <= NOW()
ORDER BY item.created_at DESC, item.id DESC
LIMIT 21;

-- Cursor page with no search preserves the Phase 1 timeline index and ordering.
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)
SELECT item.id, item.created_at
FROM cloud.items AS item
WHERE item.drive_id = '30000000-0000-4000-8000-000000000001'
  AND item.status <> 'trashed'
  AND (item.created_at, item.id) < (NOW() - interval '12 hours', 'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid)
ORDER BY item.created_at DESC, item.id DESC
LIMIT 21;
