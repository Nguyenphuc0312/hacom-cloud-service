# Hacom Cloud — Quy trình 2 Implementation

> Nhánh: `feature/process-2-personal-cloud`
> Phạm vi: Personal Cloud dạng timeline, text, link và quota

## Kết quả triển khai

- Tự tạo đúng một `cloud.drives` cho mỗi user.
- Tự tạo `cloud.quotas` theo `DEFAULT_QUOTA_BYTES`.
- Validate text/link theo `MAX_CONTENT_BYTES`, tách biệt với giới hạn upload.
- Lưu text và link trực tiếp trong PostgreSQL.
- Tính quota theo số byte UTF-8 thực tế.
- Tạo Item, cộng quota và ghi ledger trong cùng PostgreSQL transaction.
- Timeline dùng keyset/cursor pagination theo `(created_at, id)`.
- Mọi truy vấn chi tiết đều kiểm tra owner.
- Middleware local lấy UUID từ `X-Demo-User-ID`.
- Có unit test, integration test PostgreSQL và Postman collection.

## Ranh giới đã giữ đúng

Quy trình 2 **không** triển khai:

- Dedup hoặc so sánh nội dung/file.
- SHA-256 phục vụ tối ưu dung lượng.
- Nén dữ liệu.
- API `Idempotency-Key`.
- Upload file, MinIO presigned URL hoặc kết nối Chat.

Nếu user chủ động lưu cùng nội dung hai lần, hệ thống tạo hai Item riêng và tính quota hai lần.

`cloud.usage_ledger.idempotency_key` vẫn bắt buộc theo schema Gate 1. Repository tạo khóa kỹ thuật duy nhất từ `item_id` để mỗi Item có đúng một ledger entry; khóa này không dùng để chống user lưu nội dung trùng.

## Kiến trúc

```text
HTTP request
  → Demo user middleware
  → Cloud API handler
  → Cloud service (validation, UTF-8, cursor)
  → CloudPostgres repository
  → PostgreSQL transaction
      ├── ensure Drive
      ├── ensure Quota
      ├── lock Quota FOR UPDATE
      ├── insert Item
      ├── update used_bytes
      └── append usage_ledger
```

API không chứa SQL. Service không biết chi tiết PostgreSQL. Repository chịu trách nhiệm transaction và concurrency.

## Quy tắc transaction

Tạo text/link:

```text
BEGIN
→ INSERT/SELECT Drive
→ INSERT Quota nếu chưa có
→ SELECT Quota FOR UPDATE
→ kiểm tra used + reserved + item_size <= limit
→ INSERT Item
→ UPDATE used_bytes
→ INSERT ledger event consume
→ COMMIT
```

Mọi lỗi trước `COMMIT` đều rollback. Vì quota row bị khóa nên hai request đồng thời không thể cùng vượt giới hạn.

## Cursor pagination

Timeline sắp xếp:

```sql
ORDER BY created_at DESC, id DESC
```

Trang tiếp theo:

```sql
WHERE (created_at, id) < ($cursor_time, $cursor_id)
```

Cách này ổn định hơn offset khi Item mới được tạo trong lúc người dùng đang phân trang.

## Kiểm thử

Unit test:

- Byte UTF-8 tiếng Việt.
- Text rỗng/quá giới hạn.
- URL không hợp lệ.
- Cursor encode/decode.
- Error mapping API.
- Middleware user demo.
- JSON field không hỗ trợ.

Integration test PostgreSQL:

- Hai lần lưu cùng nội dung tạo hai Item.
- Timeline hai trang không lặp/mất Item.
- User khác không đọc được Item.
- `used_bytes` bằng tổng ledger.
- 12 request đồng thời vẫn chỉ tạo một Drive/Quota.
- Hai request đồng thời gần hết quota: một thành công, một bị từ chối.
- Transaction lỗi không để lại Item hoặc ledger thừa.

## Chạy test

```bash
go test ./...
go vet ./...
```

Integration test cần database đã migrate:

```bash
TEST_DATABASE_URL='postgres://hacom:hacom@localhost:5432/hacom_cloud_process2_test?sslmode=disable' \
  go test ./internal/repository -count=1 -v
```

Hoặc để script tự tạo database sạch, migrate, chạy race test và xóa database:

```bash
make test-integration-clean
```

Postman:

```text
tests/postman/Hacom-Cloud-Process-2.postman_collection.json
tests/postman/Hacom-Cloud-Local.postman_environment.json
```

Khi API đang chạy trên database demo sạch:

```bash
make test-postman
```

## Kết quả xác minh Gate 2

```text
go test -race ./...                         PASS
go vet ./...                                PASS
go build ./...                              PASS
Docker build hacom-cloud-api:process2       PASS
PostgreSQL integration tests                3/3 PASS
Postman requests/assertions                 10/10 PASS
```

Smoke test thật xác nhận:

- Hai text giống nhau có hai UUID khác nhau.
- Timeline phân trang `2 + 1`, không lặp Item.
- User khác đọc Item nhận HTTP 404.
- Text/link sử dụng tổng cộng 75 byte thì quota báo `usedBytes = 75`.
- PostgreSQL và MinIO vẫn báo `UP`.
