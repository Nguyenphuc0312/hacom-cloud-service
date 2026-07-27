# Hacom Cloud Phase 1 — ERD

> Trạng thái: đề xuất triển khai  
> Phạm vi: Personal Cloud dạng timeline, chưa có Folder, Share, Chat integration hoặc Version History

## ERD

```mermaid
erDiagram
    CLOUD_DRIVES {
        uuid id PK
        uuid owner_user_id UK
        varchar name
        drive_status status
        timestamptz archived_at
        timestamptz created_at
        timestamptz updated_at
    }

    CLOUD_STORAGE_OBJECTS {
        uuid id PK
        uuid drive_id FK
        varchar bucket
        text object_key UK
        varchar original_name
        varchar content_type
        bigint declared_size_bytes
        bigint actual_size_bytes
        char checksum_sha256
        object_status status
        scan_status scan_status
        timestamptz uploaded_at
        timestamptz verified_at
        timestamptz delete_requested_at
        timestamptz deleted_at
    }

    CLOUD_ITEMS {
        uuid id PK
        uuid drive_id FK
        item_type item_type
        item_status status
        varchar title
        text text_content
        text link_url
        uuid storage_object_id FK
        bigint size_bytes
        bigint billable_bytes
        varchar source_type
        varchar idempotency_key
        jsonb metadata
        timestamptz deleted_at
        timestamptz purge_after
        timestamptz created_at
    }

    CLOUD_UPLOAD_SESSIONS {
        uuid id PK
        uuid drive_id FK
        uuid item_id FK
        uuid storage_object_id FK
        upload_status status
        bigint declared_size_bytes
        bigint reserved_bytes
        bigint actual_size_bytes
        varchar idempotency_key UK
        text minio_upload_id
        timestamptz expires_at
        timestamptz completed_at
    }

    CLOUD_UPLOAD_PARTS {
        uuid upload_session_id PK,FK
        int part_number PK
        text etag
        bigint size_bytes
        char checksum_sha256
        timestamptz uploaded_at
    }

    CLOUD_QUOTAS {
        uuid drive_id PK,FK
        bigint quota_bytes
        bigint used_bytes
        bigint reserved_bytes
        bigint version
        timestamptz updated_at
    }

    CLOUD_USAGE_LEDGER {
        uuid id PK
        uuid drive_id FK
        uuid item_id FK
        uuid upload_session_id FK
        quota_event_type event_type
        bigint delta_used_bytes
        bigint delta_reserved_bytes
        varchar idempotency_key UK
        jsonb metadata
        timestamptz created_at
    }

    CLOUD_JOBS {
        uuid id PK
        job_type job_type
        job_status status
        uuid drive_id FK
        uuid item_id FK
        uuid storage_object_id FK
        uuid upload_session_id FK
        jsonb payload
        int attempts
        int max_attempts
        timestamptz run_after
        varchar locked_by
        timestamptz locked_at
        varchar dedupe_key
    }

    CLOUD_AUDIT_LOGS {
        uuid id PK
        timestamptz occurred_at
        uuid actor_user_id
        varchar actor_type
        varchar action
        varchar entity_type
        uuid entity_id
        uuid drive_id FK
        inet ip_address
        jsonb metadata
    }

    CLOUD_DRIVES ||--o{ CLOUD_ITEMS : owns
    CLOUD_DRIVES ||--o{ CLOUD_STORAGE_OBJECTS : owns
    CLOUD_DRIVES ||--|| CLOUD_QUOTAS : has
    CLOUD_DRIVES ||--o{ CLOUD_UPLOAD_SESSIONS : reserves
    CLOUD_DRIVES ||--o{ CLOUD_USAGE_LEDGER : records
    CLOUD_DRIVES ||--o{ CLOUD_JOBS : schedules
    CLOUD_DRIVES ||--o{ CLOUD_AUDIT_LOGS : audits

    CLOUD_STORAGE_OBJECTS ||--o{ CLOUD_ITEMS : backs
    CLOUD_ITEMS ||--o{ CLOUD_UPLOAD_SESSIONS : receives
    CLOUD_UPLOAD_SESSIONS ||--o{ CLOUD_UPLOAD_PARTS : contains
    CLOUD_UPLOAD_SESSIONS ||--o{ CLOUD_USAGE_LEDGER : affects
    CLOUD_ITEMS ||--o{ CLOUD_USAGE_LEDGER : affects
```

## Biên sở hữu dữ liệu

- `owner_user_id` và `actor_user_id` là UUID lấy từ JWT/Auth Service.
- Cloud Database không tạo foreign key sang `auth.users` vì Auth là service và database độc lập.
- PostgreSQL lưu identity, metadata, lifecycle, quota và job.
- MinIO lưu binary. Cặp `(bucket, object_key)` là vị trí duy nhất của object.
- `source_*` chỉ là soft reference để Phase sau copy từ Chat; xóa tin nhắn Chat không xóa Cloud Item.

## Quan hệ quan trọng

| Quan hệ | Cardinality | Chính sách xóa |
|---|---:|---|
| Drive → Item | 1:N | `RESTRICT`; phải purge item trước |
| Drive → Storage Object | 1:N | `RESTRICT`; phải cleanup MinIO trước |
| Drive → Quota | 1:1 | `CASCADE` khi drive thật sự bị xóa |
| Item → Storage Object | N:1 | `RESTRICT`; cho phép dedup/reference sau này |
| Item/Object → Upload Session | 1:N | `CASCADE`; session là dữ liệu kỹ thuật phụ thuộc |
| Upload Session → Upload Part | 1:N | `CASCADE` |
| Ledger → Item/Upload | N:1 | Xóa entity chỉ xóa soft reference, giữ lịch sử |
| Job → Entity | N:1 | Giữ job history, entity reference có thể về `NULL` |

Composite foreign key `(entity_id, drive_id)` ngăn tuyệt đối việc session, ledger hoặc job của người A trỏ nhầm dữ liệu người B.
