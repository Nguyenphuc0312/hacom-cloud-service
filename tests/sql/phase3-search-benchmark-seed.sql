\set ON_ERROR_STOP on
\timing on

INSERT INTO cloud.drives (id, owner_user_id, name)
VALUES
  ('30000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'Benchmark owner'),
  ('30000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', 'Scope decoy');

INSERT INTO cloud.quotas (drive_id, quota_bytes, used_bytes, trash_bytes)
VALUES
  ('30000000-0000-4000-8000-000000000001', 10000000000, 100000, 10000),
  ('30000000-0000-4000-8000-000000000002', 10000000000, 5000, 0);

INSERT INTO cloud.items (
  drive_id, item_type, status, title, text_content,
  size_bytes, billable_bytes, deleted_at, purge_after, created_at
)
SELECT
  '30000000-0000-4000-8000-000000000001'::uuid,
  'text'::cloud.item_type,
  CASE WHEN sequence % 10 = 0 THEN 'trashed' ELSE 'ready' END::cloud.item_status,
  'Document ' || sequence,
  CASE WHEN sequence % 997 = 0
    THEN 'quarterly needle financial report ' || sequence
    ELSE 'ordinary indexed document body ' || sequence
  END,
  1, 1,
  CASE WHEN sequence % 10 = 0 THEN NOW() - interval '1 hour' END,
  CASE WHEN sequence % 10 = 0 THEN NOW() + interval '23 hours' END,
  NOW() - (sequence || ' seconds')::interval
FROM generate_series(1, 100000) AS sequence;

-- Cross-owner decoys prove that repository owner/drive scoping happens before search.
INSERT INTO cloud.items (
  drive_id, item_type, status, title, text_content,
  size_bytes, billable_bytes, created_at
)
SELECT
  '30000000-0000-4000-8000-000000000002'::uuid,
  'text'::cloud.item_type,
  'ready'::cloud.item_status,
  'Needle decoy ' || sequence,
  'quarterly needle must never leak across owner scope',
  1, 1, NOW() - (sequence || ' milliseconds')::interval
FROM generate_series(1, 5000) AS sequence;

ANALYZE cloud.drives;
ANALYZE cloud.items;

SELECT count(*) AS benchmark_items FROM cloud.items;
