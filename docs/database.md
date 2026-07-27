# Database

Hacom Cloud sử dụng PostgreSQL với schema riêng `cloud`.

Tài liệu chính:

- [ERD Phase 1](database/phase1-erd.md)
- [Thiết kế và lifecycle Phase 1](database/phase1-design.md)
- [Hướng dẫn migration](../migrations/README.md)

Nguyên tắc:

- PostgreSQL lưu metadata, trạng thái, quota, job và audit; MinIO lưu binary.
- User ID là UUID tương thích `auth.users.id`, nhưng không có foreign key chéo service.
- Quota dùng reserve/commit/release và ledger idempotent.
- Item trong thùng rác vẫn tính quota cho tới khi purge vĩnh viễn.
- Phase 1 không có Folder, Share, Chat integration hoặc Version History.
