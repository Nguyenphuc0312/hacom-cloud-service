# Database migrations

Migration sử dụng định dạng của `golang-migrate`:

```text
000001_cloud_primitives
000002_cloud_content
000003_cloud_upload_and_quota
000004_cloud_worker_and_audit
000005_phase2_quota_baseline
000006_trash_lifecycle_transactions
000007_phase3_search_filter
000008_quota_request_outbox
000009_quota_admin_review
000010_audit_append_only
```

## Chạy local

```bash
brew install golang-migrate
cp .env.example .env
make infra-up
make migrate-up
make db-verify
```

Rollback một version:

```bash
make migrate-down
```

Xem version hiện tại:

```bash
make migrate-version
```

## Quy tắc

- Không sửa migration đã chạy trên môi trường dùng chung.
- Mọi thay đổi schema tiếp theo phải tạo version mới.
- Mỗi version bắt buộc có cả `up` và `down`.
- Migration phải chạy được từ database rỗng và rollback về version 0.
- Binary không được lưu trong PostgreSQL.
- Không tạo foreign key sang database của Auth, Chat hoặc HRM.

Thiết kế chi tiết:

- `docs/database/phase1-database-review.md`
- `docs/database/phase1-erd.md`
- `docs/database/phase1-design.md`
- `docs/database/phase2-erd.md`
- `docs/database/phase2-design.md`
- `docs/trash-lifecycle-transaction.md`
- `docs/database/phase3-search-design.md`
- `docs/database/phase3-quota-request-design.md`
