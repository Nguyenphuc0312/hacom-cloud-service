# ERD Phase 2 — migration baseline

Phạm vi của ERD này là persistence contract do migration `000005` bổ sung. Các bảng
Phase 1 vẫn giữ nguyên; API Trash và nghiệp vụ duyệt quota chưa được triển khai ở
quy trình này.

```mermaid
erDiagram
  DRIVES ||--|| QUOTAS : "has snapshot"
  DRIVES ||--o{ ITEMS : contains
  DRIVES ||--o{ QUOTA_REQUESTS : requests
  DRIVES ||--o{ USAGE_LEDGER : records

  DRIVES {
    uuid id PK
    uuid owner_user_id UK
    drive_status status
  }

  QUOTAS {
    uuid drive_id PK,FK
    bigint quota_bytes
    bigint used_bytes "active + trash"
    bigint trash_bytes "subset of used"
    bigint reserved_bytes
    bigint version
  }

  ITEMS {
    uuid id PK
    uuid drive_id FK
    item_status status
    bigint billable_bytes
    timestamptz deleted_at
    timestamptz purge_after
  }

  QUOTA_REQUESTS {
    uuid id PK
    uuid drive_id FK
    uuid requested_by_user_id "soft Auth reference"
    quota_request_status status
    bigint current_quota_bytes
    bigint requested_quota_bytes
    varchar idempotency_key
    uuid reviewed_by_user_id "soft Auth reference"
    timestamptz reviewed_at
  }

  USAGE_LEDGER {
    uuid id PK
    uuid drive_id FK
    bigint delta_used_bytes
    bigint delta_reserved_bytes
    varchar idempotency_key
  }
```

Quan hệ tới người dùng Auth là soft UUID reference, không tạo foreign key xuyên
service. Mỗi drive có tối đa một quota request `pending`, được bảo vệ bởi unique
partial index.
