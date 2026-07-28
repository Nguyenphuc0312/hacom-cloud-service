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

## Upload file — Quy trình 3

Cloud API không nhận binary. Client chỉ gửi metadata để giữ quota và nhận presigned URL:

```http
POST /api/v1/cloud/uploads
Content-Type: application/json
X-Demo-User-ID: <uuid>
Idempotency-Key: <unique-key>

{
  "fileName": "bao-cao.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 12345
}
```

Lần đầu trả `201`; retry cùng key và cùng metadata trả `200` với cùng session/Item. Dùng cùng key cho metadata khác trả `409 IDEMPOTENCY_CONFLICT`.

```json
{
  "uploadSessionId": "4ba79db0-2492-45e5-92c1-178e80421220",
  "itemId": "12c14a68-902f-4c84-b74e-c420f0660f44",
  "status": "initiated",
  "uploadUrl": "http://localhost:9000/...",
  "method": "PUT",
  "requiredHeaders": {
    "Content-Type": "application/pdf",
    "If-None-Match": "*"
  },
  "sizeBytes": 12345,
  "expiresAt": "2026-07-28T08:15:00Z"
}
```

Client PUT binary trực tiếp tới `uploadUrl`, dùng đầy đủ header được trả về. `If-None-Match: *` được ký vào URL để object chỉ được tạo một lần và không thể bị ghi đè bằng cách dùng lại URL. Không lưu hoặc ghi log URL này.

Sau khi PUT thành công:

```http
POST /api/v1/cloud/uploads/{uploadSessionId}/complete
X-Demo-User-ID: <uuid>
```

Complete kiểm tra object tồn tại và size thực tế bằng size khai báo. Thành công chuyển quota `reserved → used`, Item/Object sang `processing`, tạo một job `hash_file/pending`. Retry complete trả lại đúng Item/Job cũ.

Giới hạn hiện tại là `100,000,000` byte decimal. File lớn hơn phải lưu ở hệ thống khác và chỉ lưu link trong Hacom Cloud.

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
| 400 | `INVALID_UPLOAD` | Metadata upload hoặc Idempotency-Key không hợp lệ |
| 400 | `INVALID_UPLOAD_SESSION_ID` | Upload session ID không phải UUID |
| 401 | `DEMO_USER_REQUIRED` | Thiếu hoặc sai UUID local |
| 403 | `DRIVE_NOT_ACTIVE` | Drive bị suspended/archived nên không được ghi mới |
| 404 | `ITEM_NOT_FOUND` | Không có Item thuộc user hiện tại |
| 404 | `UPLOAD_SESSION_NOT_FOUND` | Session không tồn tại hoặc không thuộc user |
| 405 | `METHOD_NOT_ALLOWED` | HTTP method không được hỗ trợ |
| 409 | `QUOTA_EXCEEDED` | Không đủ quota |
| 409 | `IDEMPOTENCY_CONFLICT` | Key đã dùng với metadata khác |
| 409 | `UPLOAD_OBJECT_NOT_FOUND` | Client chưa PUT binary lên MinIO |
| 409 | `UPLOAD_SESSION_EXPIRED` | Upload session đã hết hạn |
| 413 | `BODY_TOO_LARGE` | HTTP request body vượt giới hạn |
| 413 | `FILE_TOO_LARGE` | File khai báo hoặc thực tế vượt 100 MB decimal |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | POST body không dùng `application/json` |
| 422 | `UPLOAD_SIZE_MISMATCH` | Size thực tế khác size khai báo |
| 422 | `UPLOAD_CONTENT_TYPE_MISMATCH` | MIME type thực tế khác khai báo |
| 500 | `INTERNAL_ERROR` | Lỗi nội bộ không làm lộ chi tiết database |

## Phạm vi chưa triển khai

- Không dedup nội dung; lưu cùng text/link hai lần tạo hai Item.
- Không nhận `Idempotency-Key` ở API Quy trình 2.
- Chưa kết nối Chat/Auth thật.
- Chưa chạy hash/virus scan/thumbnail; đây là phạm vi Quy trình 4.
- Chưa Multipart, download URL, share, xóa/restore hoặc cleanup session hết hạn.
