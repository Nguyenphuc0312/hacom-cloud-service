# Hacom Cloud API

## Health

| Method | Path | Mục đích |
|---|---|---|
| `GET` | `/health/live` | Liveness của API process |
| `GET` | `/health` | Readiness của PostgreSQL, migration/schema Cloud và bucket MinIO |
| `GET` | `/health/ready` | Alias readiness cho deployment |

## Xác thực local

Quy trình 2 chưa kết nối Auth Service. Các Cloud API tạm nhận UUID qua:

```http
X-Demo-User-ID: 11111111-1111-4111-8111-111111111111
```

Middleware validate UUID và đưa user vào request context. Handler và repository không hard-code user. Khi kết nối Auth Service, thay middleware này bằng JWT middleware mà không đổi service/repository.

Mỗi response Cloud API có `X-Request-ID` để đối chiếu với log server. Header này do API sinh, chưa phải distributed tracing hoàn chỉnh.

## Personal Cloud — Quy trình 2

### Tạo text

```http
POST /api/v1/cloud/texts
Content-Type: application/json
X-Demo-User-ID: <uuid>

{
  "content": "Báo cáo nghiên cứu Hacom Cloud"
}
```

### Tạo link

```http
POST /api/v1/cloud/links
Content-Type: application/json
X-Demo-User-ID: <uuid>

{
  "url": "https://hacom.vn/cloud",
  "title": "Tài liệu Hacom Cloud"
}
```

Chỉ chấp nhận URL tuyệt đối dùng `http` hoặc `https`.

### Timeline

```http
GET /api/v1/cloud/items?limit=20&cursor=<opaque-cursor>
X-Demo-User-ID: <uuid>
```

- Nếu không truyền `limit`, giá trị mặc định là 20; nếu có thì phải từ 1 đến 100.
- Cursor là giá trị opaque kết hợp `created_at` và `id`.
- Không tự chỉnh sửa hoặc suy luận nội dung cursor.

### Chi tiết Item

```http
GET /api/v1/cloud/items/{itemID}
X-Demo-User-ID: <uuid>
```

Item của user khác cũng trả `404 ITEM_NOT_FOUND` để không làm lộ sự tồn tại của dữ liệu.

### Quota

```http
GET /api/v1/cloud/quota
X-Demo-User-ID: <uuid>
```

```json
{
  "limitBytes": 5000000000,
  "usedBytes": 75,
  "reservedBytes": 0,
  "availableBytes": 4999999925,
  "updatedAt": "2026-07-28T06:24:29.692583+07:00"
}
```

Quota được đọc từ `DEFAULT_QUOTA_BYTES`; giới hạn text/link được đọc từ `MAX_CONTENT_BYTES`. Giá trị 5 GB và 100 MB decimal chỉ là cấu hình demo hiện tại.

Drive `suspended` hoặc `archived` vẫn được đọc dữ liệu đã lưu nhưng không được tạo nội dung mới. API ghi trả `403 DRIVE_NOT_ACTIVE`.

## Error response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "invalid cloud content: text content must not be blank"
  }
}
```

| HTTP | Code | Ý nghĩa |
|---:|---|---|
| 400 | `INVALID_JSON` | JSON sai hoặc có field không hỗ trợ |
| 400 | `INVALID_LIMIT` | `limit` không phải số nguyên từ 1 đến 100 |
| 400 | `VALIDATION_ERROR` | Text/link không hợp lệ |
| 400 | `INVALID_CURSOR` | Cursor không hợp lệ |
| 401 | `DEMO_USER_REQUIRED` | Thiếu hoặc sai UUID local |
| 403 | `DRIVE_NOT_ACTIVE` | Drive bị suspended/archived nên không được ghi mới |
| 404 | `ITEM_NOT_FOUND` | Không có Item thuộc user hiện tại |
| 405 | `METHOD_NOT_ALLOWED` | HTTP method không được hỗ trợ |
| 409 | `QUOTA_EXCEEDED` | Không đủ quota |
| 413 | `BODY_TOO_LARGE` | HTTP request body vượt giới hạn |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | POST body không dùng `application/json` |
| 500 | `INTERNAL_ERROR` | Lỗi nội bộ không làm lộ chi tiết database |

## Phạm vi chưa triển khai

- Không dedup nội dung; lưu cùng text/link hai lần tạo hai Item.
- Không nhận `Idempotency-Key` ở API Quy trình 2.
- Chưa upload file hoặc cấp presigned URL.
- Chưa kết nối Chat/Auth thật.
