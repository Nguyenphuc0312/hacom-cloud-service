# Hacom Cloud API

## Health

| Method | Path | Mục đích |
|---|---|---|
| `GET` | `/health/live` | Liveness của API process |
| `GET` | `/health` | Readiness của PostgreSQL, migration/schema Cloud và bucket MinIO |
| `GET` | `/health/ready` | Alias readiness cho deployment |

## Xác thực

Phase 2 production uses the frozen Bearer/JWT/JWKS contract in
[`phase2-auth-api-contract.md`](phase2-auth-api-contract.md) and the public
same-origin base `/cloud-api/api/v1/cloud`. The machine-readable authentication
boundary is [`openapi/phase2-cloud-auth.openapi.yaml`](openapi/phase2-cloud-auth.openapi.yaml).

Cloud API hỗ trợ hai mode tách biệt:

- `AUTH_MODE=demo`: chỉ được phép khi `APP_ENV=local|test`; nhận UUID qua
  `X-Demo-User-ID` để chạy Postman/demo Phase 1.
- `AUTH_MODE=jwt`: production mode; nhận access token Hacom qua:

```http
Authorization: Bearer <access-token>
```

JWT mode xác minh signature bằng JWKS, pin `RS256|ES256`, kiểm tra `kid`, issuer,
audience, `exp`, `iat`, `typ=access`, `sub`, `sid` và `jti`. `sub` là UUID owner
duy nhất dùng cho mọi repository query; `X-Demo-User-ID` bị bỏ qua trong mode
này. Token refresh/service, token sai contract, hết hạn hoặc revoked đều bị từ
chối.

Revocation dùng cùng contract với Auth/Chat:

```text
blacklist:<jti>
auth_session_invalid_before:<sid>
auth_invalid_before:<sub>
```

Sau bước JWT và Redis revocation, Cloud dùng service token ngắn hạn của
`hacom-cloud-service` để gọi Auth `check-account-state` bằng `sub` và `sid`.
Service token được cache trước hạn, request đồng thời được coalesce và chỉ refresh
một lần khi Auth trả `401`. Tài khoản không active trả
`403 ACCOUNT_NOT_ACTIVE`; session không còn hợp lệ trả `401 SESSION_REVOKED`.
Redis/JWKS/Auth account authority không khả dụng làm protected request fail
closed; API không tự decode token hoặc fallback sang UUID do client cung cấp.

Trong local demo, header tương thích dưới đây chỉ được bật ở `local|test` và
không được xuất hiện trong môi trường triển khai:

```http
X-Demo-User-ID: 11111111-1111-4111-8111-111111111111
```

Middleware của cả hai mode đều tạo cùng `auth.Principal` trong request context,
vì vậy handler/repository không hard-code hoặc tự đọc owner từ body/header.

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
  "activeBytes": 50,
  "trashBytes": 25,
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

## Truy cập nội dung file để preview/download

Chỉ Item dạng file đã được Worker đưa sang `ready` mới được cấp URL truy cập:

```http
GET /api/v1/cloud/items/{itemID}/access
X-Demo-User-ID: <uuid>
```

```json
{
  "itemId": "12c14a68-902f-4c84-b74e-c420f0660f44",
  "url": "http://localhost:9000/...",
  "expiresAt": "2026-07-31T09:15:00Z",
  "fileName": "bao-cao.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 12345
}
```

Contract:

- Client chỉ gửi `itemID`; không được tự gửi hoặc suy luận bucket/object key.
- Backend kiểm tra Item thuộc user hiện tại, Item và Storage Object cùng ở trạng
  thái `ready`, object thật sự tồn tại trong MinIO và size khớp metadata.
- Item của user khác trả `404 ITEM_NOT_FOUND`, giống Item không tồn tại.
- URL là presigned GET có TTL cấu hình bằng `DOWNLOAD_URL_TTL` (mặc định 15
  phút). Response JSON có `Cache-Control: no-store`; không lưu hoặc ghi log URL.
- Frontend dùng URL này cho viewer ảnh, video, audio, text, PDF và các định dạng
  trình duyệt hỗ trợ; định dạng không preview được vẫn có thể tải xuống.

## Search và filter timeline — Phase 3

Hai endpoint `GET /api/v1/cloud/items` và `GET /api/v1/cloud/trash` nhận cùng
contract query: `q`, `type`, `from`, `to`, `cursor`, `limit`. `q` sau chuẩn hóa
phải dài 3–200 ký tự; `type` thuộc `text|link|file|image|video|audio`; `from` và
`to` là RFC3339, bao gồm cả hai biên. Mặc định vẫn sắp xếp
`createdAt DESC, itemId DESC`.

```http
GET /api/v1/cloud/items?q=quarterly+report&type=file&from=2026-08-01T00:00:00Z&limit=20
X-Demo-User-ID: <uuid>
```

Cursor là opaque và được ký logic bằng fingerprint của scope cùng toàn bộ filter.
Đổi filter hoặc dùng cursor active cho Trash trả `400 INVALID_CURSOR`. Query lạ,
lặp tham số, timestamp sai, khoảng ngày đảo hoặc input vượt giới hạn trả
`400 INVALID_FILTER`. Search luôn được giới hạn owner/drive và timeout bởi
`SEARCH_QUERY_TIMEOUT` (mặc định 2 giây).

## Trash, restore và xóa vĩnh viễn — Phase 2

Ba thao tác ghi yêu cầu `Idempotency-Key` dài 1–128 ký tự và body rỗng:

```http
POST   /api/v1/cloud/items/{itemID}/trash
POST   /api/v1/cloud/items/{itemID}/restore
DELETE /api/v1/cloud/items/{itemID}
Idempotency-Key: <unique-operation-key>
X-Demo-User-ID: <uuid>
```

Move-to-trash trả trạng thái `trashed`, `deletedAt` và `purgeAfter`; restore trả
`ready`. Retry cùng key và cùng Item/action trả lại kết quả cũ với `applied=false`,
không tạo thêm ledger/audit. Dùng lại key cho action hoặc Item khác trong cùng
drive trả `409 IDEMPOTENCY_CONFLICT`.

DELETE luôn trả `202 Accepted` theo một schema thống nhất:

```json
{
  "itemId": "12c14a68-902f-4c84-b74e-c420f0660f44",
  "status": "delete_pending",
  "async": true
}
```

`async=true` nghĩa là quota/metadata đã commit nhưng Worker còn phải xóa binary.
Text/link trả `status=deleted`, `async=false`. Response không chứa bucket, object
key, job ID hoặc chi tiết purge nội bộ.

Danh sách Trash dùng cursor opaque và cùng giới hạn 1–100:

```http
GET /api/v1/cloud/trash?limit=20&cursor=<opaque-cursor>
X-Demo-User-ID: <uuid>
```

Owner có thể gọi endpoint `/items/{itemID}/access` cho file trong Trash khi
`now < purgeAfter`. TTL URL được rút ngắn để không vượt quá `purgeAfter`. Item
không tồn tại và Item của owner khác luôn có cùng response `404 ITEM_NOT_FOUND`.

## Quota request — Phase 3

User chỉ có thể gửi yêu cầu tăng quota; không có API ghi trực tiếp
`cloud.quotas`. Contract hiện tại gồm:

```http
POST /api/v1/cloud/quota/requests
Content-Type: application/json
Idempotency-Key: quota-request-2026-08-04

{"requestedQuotaBytes":10000000000,"reason":"Dung lượng cho dự án"}
```

```http
GET /api/v1/cloud/quota/requests/current
```

`requestedQuotaBytes` bắt buộc là số nguyên byte và phải trùng một tier trong
`QUOTA_REQUEST_TIERS_BYTES` (mặc định 10/25/50 GB decimal). Request mới phải lớn
hơn quota hiện tại. Mỗi drive chỉ có một request `pending`; retry cùng key và
cùng payload trả `200` với `applied=false`, lần tạo đầu trả `201`.

`current` trả request mới nhất để user tiếp tục thấy kết quả `approved` hoặc
`rejected`. Contract đã chốt chưa có trạng thái `cancelled`, vì vậy không expose
endpoint cancel và không sửa enum Phase 2. Mỗi lần tạo ghi request, audit và
outbox event trong cùng transaction; chưa có publisher gửi notification. Reason
chỉ nằm trong request/response của owner, không được đưa vào audit metadata,
outbox payload hoặc metric.

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
| 400 | `INVALID_TRASH_REQUEST` | Thiếu/sai `Idempotency-Key` hoặc input Trash không hợp lệ |
| 409 | `INVALID_ITEM_STATE` | Trạng thái Item không cho phép thao tác Trash hiện tại |
| 409 | `RESTORE_EXPIRED` | Đã hết thời hạn khôi phục 24 giờ |
| 409 | `DELETE_PENDING` | Binary đang chờ Worker xóa vĩnh viễn |
| 400 | `INVALID_JSON` | JSON sai hoặc có field không hỗ trợ |
| 400 | `INVALID_LIMIT` | `limit` không phải số nguyên từ 1 đến 100 |
| 400 | `VALIDATION_ERROR` | Text/link không hợp lệ |
| 400 | `INVALID_CURSOR` | Cursor không hợp lệ |
| 400 | `INVALID_QUOTA_REQUEST` | Body, integer byte, reason hoặc `Idempotency-Key` không hợp lệ |
| 400 | `INVALID_QUOTA_TIER` | Mức quota không thuộc tier được cấu hình |
| 400 | `INVALID_UPLOAD` | Metadata upload hoặc Idempotency-Key không hợp lệ |
| 400 | `INVALID_UPLOAD_SESSION_ID` | Upload session ID không phải UUID |
| 400 | `INVALID_ITEM_ID` | Item ID của endpoint access không phải UUID |
| 401 | `DEMO_USER_REQUIRED` | Thiếu hoặc sai UUID ở local demo mode |
| 401 | `AUTH_REQUIRED` | Thiếu/sai định dạng Bearer token ở JWT mode |
| 401 | `INVALID_ACCESS_TOKEN` | Token sai signature/contract/issuer/audience/type hoặc hết hạn |
| 401 | `SESSION_REVOKED` | JTI/session/user đã bị Auth thu hồi hoặc session không còn tồn tại |
| 403 | `ACCOUNT_NOT_ACTIVE` | Tài khoản bị khóa, vô hiệu hóa, chưa xác minh hoặc đã xóa |
| 503 | `AUTH_AUTHORITY_UNAVAILABLE` | JWKS, Redis revocation hoặc Auth account authority không khả dụng; request fail closed |
| 403 | `DRIVE_NOT_ACTIVE` | Drive bị suspended/archived nên không được ghi mới |
| 404 | `ITEM_NOT_FOUND` | Không có Item thuộc user hiện tại |
| 404 | `QUOTA_REQUEST_NOT_FOUND` | User chưa từng tạo quota request |
| 404 | `UPLOAD_SESSION_NOT_FOUND` | Session không tồn tại hoặc không thuộc user |
| 405 | `METHOD_NOT_ALLOWED` | HTTP method không được hỗ trợ |
| 409 | `QUOTA_EXCEEDED` | Không đủ quota |
| 409 | `IDEMPOTENCY_CONFLICT` | Key đã dùng với metadata khác |
| 409 | `QUOTA_REQUEST_PENDING` | Drive đã có một request pending |
| 409 | `UPLOAD_OBJECT_NOT_FOUND` | Client chưa PUT binary lên MinIO |
| 409 | `UPLOAD_SESSION_EXPIRED` | Upload session đã hết hạn |
| 409 | `ITEM_NOT_FILE` | Item không phải file/image/video/audio |
| 409 | `ITEM_NOT_READY` | File hoặc Storage Object chưa ở trạng thái `ready` |
| 409 | `FILE_OBJECT_UNAVAILABLE` | Object MinIO thiếu hoặc không khớp metadata |
| 413 | `BODY_TOO_LARGE` | HTTP request body vượt giới hạn |
| 413 | `FILE_TOO_LARGE` | File khai báo hoặc thực tế vượt 100 MB decimal |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | POST body không dùng `application/json` |
| 422 | `UPLOAD_SIZE_MISMATCH` | Size thực tế khác size khai báo |
| 422 | `UPLOAD_CONTENT_TYPE_MISMATCH` | MIME type thực tế khác khai báo |
| 500 | `INTERNAL_ERROR` | Lỗi nội bộ không làm lộ chi tiết database |

## Quy tắc an toàn Gate 5

- Local demo yêu cầu UUID hợp lệ trong `X-Demo-User-ID`; production bắt buộc JWT
  đã verify và tuyệt đối không tin owner UUID do client gửi.
- JSON có field lạ, JSON nối đuôi, body quá lớn và media type sai đều bị từ
  chối trước khi gọi service.
- Item/session của user khác trả cùng `404` như dữ liệu không tồn tại.
- Object key do server sinh theo `uploads/{owner_uuid}/{object_uuid}`; tên file
  client không đi vào key.
- Presigned upload URL ký `Content-Type` cùng `If-None-Match: *`; presigned
  access URL chỉ được cấp sau khi kiểm tra ownership/readiness/object, cả hai có
  TTL ngắn.
- Internal error response chỉ trả `INTERNAL_ERROR`; logger chỉ giữ request ID,
  method, path, owner và loại lỗi, không serialize lỗi dependency.
- Không ghi binary, presigned URL, access key, secret key, SQL hay object key
  vào log/báo cáo kiểm thử.

Endpoint access là phần bổ sung phục vụ preview UI, không thay đổi contract
upload, quota hoặc lifecycle đã đóng băng của Gate 5.

## Phạm vi chưa triển khai

- Không dedup nội dung; lưu cùng text/link hai lần tạo hai Item.
- API tạo text/link không nhận `Idempotency-Key`; API lifecycle Trash bắt buộc header này.
- Backend đã có JWT/JWKS/revocation middleware; frontend/gateway production cutover
  thuộc nhiệm vụ tiếp theo của Quy trình 1.
- Worker đã chạy SHA-256; chưa có virus scan hoặc sinh thumbnail phía server.
- Preview hiện phụ thuộc khả năng phát nội dung của trình duyệt; chưa chuyển mã
  video/audio và chưa render bộ Office phía server.
- Chưa Multipart hoặc share.
- Cleanup upload hết hạn đã có; chưa có dashboard quản trị job.
