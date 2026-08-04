# Hacom Cloud — Báo cáo review Phase 1 và kế hoạch phát triển Phase 2

> Ngày lập: 04/08/2026  
> Trạng thái đầu vào: Phase 1 đã qua Gate 5; Cloud Web và file preview đang ở nhánh tính năng  
> Phạm vi đề xuất: Productization Web-first cho Personal Cloud  
> Nhóm thực hiện: 4 người

## 1. Kết luận điều hành

Phase 1 đã hoàn thành vertical slice kỹ thuật từ API đến storage và Worker:

```text
Cloud Web
→ Cloud API (Go)
→ PostgreSQL schema cloud
→ presigned PUT/GET
→ MinIO private bucket
→ Cloud Worker
→ file READY và preview/download
```

Nền tảng hiện tại đủ tốt để bước sang Phase 2, nhưng chưa thể xem là bản dùng thật
trong môi trường Hacom vì API vẫn tin `X-Demo-User-ID`, chưa xác minh access token
của `chat-auth-service`. Trash đã được chuẩn bị một phần trong schema nhưng chưa có
repository, API, Worker purge hoặc giao diện. Bảng audit cũng mới tồn tại ở database,
chưa được ghi từ nghiệp vụ.

Phase 2 nên tập trung biến demo thành một Personal Cloud Web có thể dùng thật:

1. Kết nối danh tính và phiên đăng nhập Hacom an toàn.
2. Hoàn thiện Trash, khôi phục trong 24 giờ và xóa vĩnh viễn.
3. Hiển thị đúng dung lượng đang dùng, dung lượng Trash và dung lượng còn lại.
4. Bổ sung tìm kiếm, lọc loại nội dung và quản lý quota.
5. Hoàn thiện giao diện kế thừa Chat và luồng quản trị quota.
6. Có audit, metric, test tích hợp, E2E và release gate đủ để triển khai thử nghiệm.

Không đưa Folder, Share, Team Drive, Version History, AI indexing, deduplication,
virus scan production, Mobile hoặc Desktop vào Phase 2 core. Các phần này chỉ bắt
đầu sau khi contract Web/API của Phase 2 ổn định.

## 2. Nguồn chuẩn và quyết định kiến trúc

Một số tài liệu research cũ đề xuất đặt Cloud trong `chat-api-service`. Quyết định
triển khai thực tế của Phase 1 đã thay đổi: Cloud là service Go độc lập trong
`hacom-cloud-service`. Phase 2 tiếp tục theo kiến trúc đang chạy, không đưa nghiệp
vụ Cloud trở lại Chat API.

Nguồn chuẩn theo thứ tự:

1. Migration và code trong `hacom-cloud-service`.
2. `docs/api.md`, `docs/file-preview-contract.md` và báo cáo Gate 5.
3. JWT contract do `chat-auth-service` sở hữu.
4. Cloud Web trong `chat-web-client/src/features/cloud`.
5. Tài liệu research cũ chỉ dùng làm bối cảnh, không được ghi đè code/contract mới.

Ranh giới sở hữu:

| Thành phần | Trách nhiệm Phase 2 |
|---|---|
| `hacom-cloud-service` | Item, quota, Trash, upload, file access, job, audit và API Cloud |
| `chat-auth-service` | Phát hành token, JWKS, session/account state và revocation |
| `chat-web-client` | Giao diện Cloud kế thừa Chat, truyền access token và trải nghiệm người dùng |
| `chat-admin-service/panel` | Xác thực quyền admin và giao diện duyệt quota |
| PostgreSQL schema `cloud` | Metadata, lifecycle, quota, request, job và audit |
| MinIO | Binary private; client chỉ truy cập bằng presigned URL TTL ngắn |

## 3. Review chức năng Phase 1

### 3.1 Đã hoàn thành

| Nhóm | Chức năng hiện có | Đánh giá |
|---|---|---|
| Runtime | API và Worker là hai process Go độc lập | Đạt |
| Hạ tầng | PostgreSQL, MinIO private bucket, healthcheck và volume local | Đạt |
| Personal Drive | Mỗi UUID owner có một drive, quota mặc định 5 GB decimal | Đạt cho demo |
| Nội dung | Tạo text, link, lấy chi tiết và timeline cursor-based | Đạt |
| Upload | Reserve quota, presigned PUT, complete idempotent, kiểm tra object/size/MIME | Đạt |
| Giới hạn | Tối đa 100.000.000 byte cho một nội dung/file | Đạt |
| Worker | Claim bằng `SKIP LOCKED`, retry/backoff, stale recovery, SHA-256 | Đạt |
| Cleanup | Dọn upload session hết hạn và release reservation đúng một lần | Đạt |
| Quota | `used_bytes`, `reserved_bytes`, ledger append-only và reconciliation | Đạt |
| File access | Ownership, trạng thái READY, MinIO stat và presigned GET TTL ngắn | Đạt trên nhánh preview |
| Cloud Web | Chat shell, timeline, text/link, upload, progress và quota | Đạt trên nhánh Cloud UI |
| Preview | Ảnh, video, audio, text/PDF và download qua viewer kế thừa Chat | Đạt trên nhánh preview |
| Security cơ bản | Body limit, strict JSON, ownership 404, không log presigned URL/secret | Đạt |
| Release | Gate 5 không còn BLOCKER/MAJOR | Đạt |

### 3.2 Trạng thái source cần xử lý trước Phase 2

- Backend release Phase 1 đang ở `main` commit `1ce5ecf`.
- Backend file access/preview đang ở `feature/cloud-file-preview`, commit `815eddd`.
- Frontend Cloud UI đang ở `feature/process-5-cloud-ui`, commit `e5fc3b3`.
- Frontend preview đang ở `feature/cloud-file-preview`, commit `238cec1`.
- `chat-web-client/.env` có cấu hình local không được commit.

Vì vậy, “Phase 1 hoàn thành” đúng ở mức chức năng và acceptance, nhưng trước khi
code Phase 2 phải tạo một baseline tích hợp chứa cả backend release, file access,
Cloud UI và preview. Không phát triển Phase 2 trực tiếp trên các nhánh rời hiện tại.

### 3.3 Phần mới chỉ có nền móng

| Phần | Hiện trạng |
|---|---|
| Trash | Enum, `deleted_at`, `purge_after` và index đã có; chưa có nghiệp vụ |
| Permanent delete | Job type và object state đã có; chưa đăng ký handler |
| Audit | Bảng/index đã có; chưa có audit writer trong service/repository |
| Virus scan/thumbnail | Enum/job type đã có; chưa có handler production |
| Search/filter | Timeline chỉ có cursor/limit, chưa có query theo từ khóa/loại |
| Quota request | Chưa có bảng, API người dùng hoặc API quản trị |
| Production Auth | Package `internal/auth` mới là placeholder |

### 3.4 Khoảng trống và rủi ro cần giải quyết

1. `X-Demo-User-ID` có thể bị giả mạo; không được dùng trong môi trường triển khai.
2. Cloud Web dùng UUID từ client nhưng backend chưa xác minh token sở hữu UUID đó.
3. Trash chưa có transaction đảm bảo quota, item và object cùng trạng thái.
4. Chưa có xử lý race giữa restore và Worker purge.
5. `usedBytes` chưa tách active data và Trash như contract sản phẩm mới.
6. Chưa có API tìm kiếm/lọc phía server; lọc client không đủ khi timeline phân trang.
7. Audit table chưa tạo bằng chứng cho xóa, restore, duyệt quota và tác vụ admin.
8. File Office/archive/executable chưa có preview server-side; hiện chỉ fallback download.
9. Cloud UI và preview chưa nằm trên một baseline chung của `main`.
10. Chưa có production deployment profile và dashboard job/quota.

### 3.5 Baseline kiểm tra ngày 04/08/2026

| Kiểm tra | Kết quả |
|---|---|
| `go test ./...` | Pass |
| `go vet ./...` | Pass |
| 5 Cloud frontend test files | Pass, 11/11 test |
| `npm run typecheck` | Pass |
| Gate 5 release suite lịch sử | Pass theo `docs/process5-release-report.md` |

Lần review này không thay thế release integration suite có PostgreSQL/MinIO; suite
đó vẫn phải chạy lại ở Gate cuối Phase 2.

## 4. Phạm vi chức năng Phase 2

### 4.1 Production identity và authorization

- Cloud API nhận `Authorization: Bearer <access-token>`.
- Xác minh chữ ký, thuật toán, `kid`, issuer, audience, expiry và `typ=access`.
- Lấy owner từ claim `sub`; `userId` chỉ là alias tương thích chuyển tiếp.
- Kiểm tra session/account revocation theo contract của Auth.
- Protected write phải fail closed nếu không xác minh được trạng thái phiên/tài khoản.
- `X-Demo-User-ID` chỉ tồn tại khi `AUTH_MODE=demo` và `APP_ENV=local`.
- Không nhận owner UUID từ body/query/header ở production.
- Thêm service-token contract cho API nội bộ từ Admin Service.

### 4.2 Trash và xóa vĩnh viễn

Người dùng có hai lựa chọn rõ ràng:

1. **Đưa vào Trash**: item biến mất khỏi Cloud chính, vẫn tính quota và có thể
   khôi phục trong 24 giờ.
2. **Xóa ngay**: item biến mất ngay, quota logic được giải phóng trong transaction;
   binary được Worker xóa khỏi MinIO theo cơ chế retry.

API đề xuất và được chốt cho Phase 2:

```http
POST   /api/v1/cloud/items/{itemId}/trash
POST   /api/v1/cloud/items/{itemId}/restore
DELETE /api/v1/cloud/items/{itemId}
GET    /api/v1/cloud/trash?limit=20&cursor=<opaque>
```

Quy tắc:

- `POST /trash` và `POST /restore` phải idempotent.
- `DELETE` là xóa vĩnh viễn, trả `202 Accepted` khi cần Worker xóa binary.
- Item text/link có thể purge trong transaction nhưng response contract vẫn thống nhất.
- Item `pending/processing` không đi vào Trash; thao tác xóa sẽ cancel upload/job,
  release reservation/usage đúng một lần và cleanup object tạm.
- Item ổn định `ready` mới có thể đưa vào Trash.
- `purgeAfter = deletedAt + 24h`, dùng thời gian UTC do server tạo.
- Restore chỉ thành công khi `now < purgeAfter` và Worker chưa thắng lock purge.
- Race restore/purge phải khóa cùng Item; chỉ một nhánh được commit.
- Owner được preview/download item trong Trash trước `purgeAfter`.
- Cross-owner luôn trả `404`, không làm lộ item.
- Worker quét item hết hạn, enqueue `permanent_delete` idempotent và xóa object.
- Object MinIO thiếu được xem là delete thành công, nhưng vẫn phải hoàn tất ledger/audit.

### 4.3 Contract dung lượng

Giữ nguyên quota mặc định `5.000.000.000` byte và giới hạn mỗi nội dung
`100.000.000` byte.

Định nghĩa chuẩn:

```text
activeBytes  = dung lượng item đang ở Cloud chính
trashBytes   = dung lượng item trong Trash, chưa hết hạn/chưa purge
usedBytes    = activeBytes + trashBytes
reservedBytes = dung lượng đang giữ cho upload chưa complete
availableBytes = limitBytes - usedBytes - reservedBytes
```

Ví dụ UI:

```text
Dung lượng: 3,2 / 5 GB
Trong đó:
- 2 GB đang sử dụng
- 1,2 GB trong Trash
```

Chuyển vào Trash:

```text
activeBytes -= item.billableBytes
trashBytes  += item.billableBytes
usedBytes không đổi
availableBytes không đổi
```

Restore thực hiện phép biến đổi ngược, không kiểm tra quota lại vì item chưa từng
giải phóng quota. Xóa vĩnh viễn hoặc auto purge giảm `trashBytes`/`usedBytes`; xóa
ngay từ Cloud chính giảm `activeBytes`/`usedBytes`. Mọi biến động phải có ledger
idempotent và invariant database:

```text
0 <= trashBytes <= usedBytes
0 <= usedBytes + reservedBytes <= limitBytes
activeBytes = usedBytes - trashBytes
```

Response quota tương thích ngược bằng cách giữ `usedBytes` và bổ sung:

```json
{
  "limitBytes": 5000000000,
  "usedBytes": 3200000000,
  "activeBytes": 2000000000,
  "trashBytes": 1200000000,
  "reservedBytes": 0,
  "availableBytes": 1800000000
}
```

### 4.4 Search và filter

Mở rộng endpoint timeline, không tạo endpoint tìm kiếm trùng lặp:

```http
GET /api/v1/cloud/items?q=<text>&type=<type>&from=<iso>&to=<iso>&limit=20&cursor=<opaque>
GET /api/v1/cloud/trash?q=<text>&type=<type>&limit=20&cursor=<opaque>
```

- `type`: `text|link|file|image|video|audio`, có thể truyền nhiều giá trị theo
  contract được chốt trong OpenAPI.
- Search text/title/file name/link theo PostgreSQL; không tải toàn bộ timeline về client.
- Cursor phải gắn với filter fingerprint để không dùng nhầm cursor cho query khác.
- Index được kiểm tra bằng `EXPLAIN ANALYZE` trên bộ dữ liệu tối thiểu 100.000 item.
- Kết quả vẫn giữ sort `created_at DESC, id DESC` ổn định.

### 4.5 Quota request và quản trị cơ bản

User API:

```http
POST /api/v1/cloud/quota/requests
GET  /api/v1/cloud/quota/requests/current
```

Admin flow:

```text
Admin Panel
→ Chat Admin Service xác minh admin và permission cloud.quota.review
→ service token gọi Cloud internal admin API
→ Cloud transaction cập nhật request + quota + audit
```

Quy tắc:

- Mỗi drive chỉ có một request `pending`.
- Requested quota phải lớn hơn quota hiện tại và theo tier cấu hình.
- Không được giảm quota thấp hơn `usedBytes + reservedBytes`.
- Approve/reject idempotent; request đã xử lý không được xử lý lại khác kết quả.
- Cloud Service là nơi duy nhất cập nhật `cloud.quotas`.
- Mọi thao tác ghi actor admin, request ID, quota cũ/mới và lý do vào audit.

### 4.6 Cloud Web hoàn chỉnh

- Giữ nguyên giao diện kế thừa Chat, không biến thành Google Drive.
- Search và filter ảnh/video/file/link/audio ngay trên sidebar/timeline.
- Menu xóa hiển thị hai lựa chọn và mô tả ảnh hưởng quota.
- Trang/khung Trash hiển thị thời gian còn lại, restore, xóa ngay và empty Trash.
- Storage panel hiển thị active, Trash, reserved và available.
- Form gửi yêu cầu tăng quota và trạng thái pending/approved/rejected.
- Preview trong Trash dùng access URL mới, không tái dùng URL hết hạn.
- Loading/error/empty/offline state, responsive và keyboard accessibility đầy đủ.
- Không gửi `X-Demo-User-ID` ở production; dùng access token của session Hacom.

### 4.7 Audit, metric và vận hành

Audit tối thiểu:

```text
cloud.item.trash
cloud.item.restore
cloud.item.delete_requested
cloud.item.purged
cloud.quota.requested
cloud.quota.approved
cloud.quota.rejected
cloud.auth.denied
```

Metric tối thiểu:

```text
cloud_http_requests_total
cloud_auth_failures_total
cloud_trash_items_total
cloud_purge_jobs_total
cloud_purge_failures_total
cloud_quota_bytes
cloud_quota_reconcile_mismatch_total
cloud_worker_dead_jobs_total
```

Không đưa file name nhạy cảm, nội dung, token, presigned URL, object key hoặc secret
vào log/metric/audit metadata.

## 5. Ngoài phạm vi Phase 2

- Folder nhiều cấp, rename/move folder.
- Chia sẻ public/private, Team Drive và ACL theo thư mục.
- Version history.
- Lưu/copy message từ Chat sang Cloud.
- AI indexing, OCR, embedding và knowledge base.
- Dedup binary theo checksum.
- Virus scanner production hoặc server-side Office conversion.
- Transcode video/audio và thumbnail nâng cao.
- Kafka/Kubernetes production-grade.
- Mobile/Desktop implementation; chỉ giữ API đủ trung lập để tích hợp sau.

Nếu phát sinh yêu cầu ngoài danh sách Phase 2, phải đưa vào backlog Phase 3 thay vì
chen vào quy trình đang chạy.

## 6. Contract chung bắt buộc

### 6.1 Contract kỹ thuật

1. Không sửa migration `000001`–`000004`; Phase 2 bắt đầu từ `000005`.
2. Không đổi tên hoặc xóa endpoint Phase 1.
3. Không đổi quota 5 GB decimal và giới hạn 100 MB decimal nếu chưa có ADR.
4. Không lưu binary trong PostgreSQL; không lưu presigned URL trong database.
5. Cloud Service là owner duy nhất của schema `cloud` và quota transaction.
6. Mọi write có khả năng retry phải có idempotency key/dedupe key ổn định.
7. Mọi ownership query bắt buộc scope theo owner lấy từ token.
8. Cross-owner và missing resource trả cùng `404`.
9. Không decode-only JWT; phải verify đầy đủ theo JWT/Auth contract.
10. Không log token, password, binary, presigned URL, object key hoặc secret.
11. API/Worker shutdown phải graceful; job được retry không nhân đôi ledger/audit.
12. OpenAPI/API docs, test và code phải thay đổi trong cùng commit/PR contract.

### 6.2 Contract Git và phối hợp

- Không commit trực tiếp lên `main`.
- Mỗi quy trình có một nhánh tích hợp chung:

```text
integration/phase-2-process-1-baseline-auth
integration/phase-2-process-2-trash-lifecycle
integration/phase-2-process-3-search-quota-admin
integration/phase-2-process-4-cloud-web
integration/phase-2-process-5-release
```

- Quy trình sau chỉ tạo từ commit Gate đã được merge của quy trình trước.
- Cả bốn người commit lên đúng nhánh của quy trình; không tự mở nhánh tích hợp khác.
- Trước khi sửa, mỗi người công bố file ownership để tránh sửa chồng.
- Commit nhỏ, một mục đích, message theo Conventional Commits.
- Không force-push, không rewrite history và không commit `.env`/secret.
- Push xong phải báo commit SHA, test đã chạy và file đã thay đổi.
- Thay đổi contract phải được bốn người xác nhận trước khi merge.

### 6.3 Definition of Done chung

Một nhiệm vụ chỉ hoàn thành khi:

- Code, migration và API docs đồng bộ.
- Có unit test; phần persistence/lifecycle có integration test PostgreSQL/MinIO.
- Có test ownership, idempotency, retry và failure path liên quan.
- `go test -race -count=1 ./...`, `go vet ./...`, `go build ./...` đạt.
- Frontend lint, test, typecheck và build đạt cho phạm vi thay đổi.
- Không còn BLOCKER/MAJOR từ review bảo mật và dữ liệu.
- Có bằng chứng test/release ghi trong báo cáo quy trình.

## 7. Quy trình 1 — Baseline Phase 1 và Production Auth

### Mục tiêu

Tạo baseline duy nhất chứa toàn bộ Phase 1, khóa contract Phase 2 và thay demo
identity bằng xác thực Hacom thật mà không phá local demo.

### Người 1 — JWT/JWKS middleware Cloud API

**Nội dung**

- Implement `internal/auth` theo JWT contract của `chat-auth-service`.
- Verify `alg`, `kid`, JWKS signature, `iss`, `aud`, `exp`, `typ`, `sub`, `sid`, `jti`.
- Cache JWKS có TTL, refresh khi gặp `kid` mới và chống thundering herd.
- Tạo principal trong context; handler chỉ đọc principal, không đọc owner từ client.
- Tách `AUTH_MODE=demo|jwt`; cấm demo mode khi `APP_ENV` không phải local/test.

**Hướng dẫn**

- Không copy private key hoặc Auth database vào Cloud Service.
- Không nhận refresh/service token trên user route.
- Viết table-driven test cho token hết hạn, sai issuer/audience/type/algorithm và JWKS lỗi.
- Write path fail closed khi revocation dependency không khả dụng.

**Đầu ra**

- Auth config, verifier, middleware, principal model và test.
- Tài liệu biến môi trường/JWKS/revocation.
- Security evidence cho các token bị từ chối.

### Người 2 — Schema Phase 2 và migration baseline

**Nội dung**

- Thiết kế migration `000005` cho `trash_bytes`, quota request và constraint/index cần thiết.
- Giữ `used_bytes` là tổng active + Trash để tương thích Phase 1.
- Bổ sung enum/status bằng phương án rollback được.
- Viết backfill an toàn cho database đã có Item.

**Hướng dẫn**

- Không sửa migration Phase 1.
- Migration phải chạy được trên database rỗng và database có dữ liệu Phase 1.
- Có `down`, schema verification và reconciliation query.
- Chưa viết API Trash ở quy trình này; chỉ cung cấp persistence contract đã review.

**Đầu ra**

- Migration `000005` up/down.
- ERD Phase 2 và database design note.
- Test migrate up/down/backfill/invariant.

### Người 3 — Frontend auth transport và baseline Cloud UI

**Nội dung**

- Gom Cloud UI + file preview vào baseline Phase 2.
- Thay transport Cloud để gửi access token từ auth store.
- Chỉ gửi `X-Demo-User-ID` khi local demo flag được bật rõ ràng.
- Chuẩn hóa lỗi `401/403`, refresh session và retry một lần theo auth coordinator.

**Hướng dẫn**

- Không lưu token mới ngoài cơ chế auth hiện có của Chat Web.
- Không retry vòng lặp khi token/revocation bị từ chối.
- Không gọi trực tiếp MinIO ngoài presigned URL do Cloud API trả.
- Giữ giao diện Chat shell và preview hiện có.

**Đầu ra**

- Baseline Cloud Web tích hợp token Hacom.
- Unit test transport/401/refresh/demo flag.
- Cấu hình local hybrid không chứa secret.

### Người 4 — Contract, gateway và security acceptance

**Nội dung**

- Chốt OpenAPI/auth error catalog và gateway route `/cloud-api`.
- Viết contract test Cloud API với access token thật/test key.
- Kiểm tra CORS, proxy headers, rate limit, request ID và owner spoofing.
- Review dependency giữa Auth, Cloud, Web và Admin.

**Hướng dẫn**

- Phải có test chứng minh user A không đọc/ghi dữ liệu user B.
- Header owner giả phải bị bỏ qua hoặc từ chối trong JWT mode.
- Không đưa token thật vào fixture/log.
- Ghi rõ rollback về demo mode chỉ dành cho local.

**Đầu ra**

- Auth/API contract Phase 2.
- Postman/contract test và security checklist.
- Báo cáo Gate 1 với commit SHA.

### Gate 1

- Baseline Phase 1 đã hợp nhất, test xanh.
- User đăng nhập Hacom đọc/ghi đúng Personal Drive của mình.
- Token sai/hết hạn/revoked bị từ chối.
- Không thể spoof owner bằng `X-Demo-User-ID`.
- Migration `000005` up/down/backfill đạt.
- Không còn BLOCKER/MAJOR về identity hoặc migration.

## 8. Quy trình 2 — Trash, Restore và Permanent Delete

### Mục tiêu

Hoàn thiện lifecycle 24 giờ, quota breakdown và xóa binary an toàn/idempotent.

### Người 1 — Trash repository và quota transaction

**Nội dung**

- Implement transaction move-to-trash, restore và logical purge.
- Khóa Item + quota theo thứ tự cố định để tránh deadlock.
- Cập nhật `trash_bytes`, `used_bytes`, ledger và audit cùng transaction.
- Enforce ownership, state machine và thời hạn 24 giờ.

**Hướng dẫn**

- Move/restore không đổi `used_bytes`.
- Permanent delete giảm quota đúng một lần.
- Retry cùng operation không tạo ledger/audit trùng.
- Thiết kế race restore/purge bằng row lock và test đồng thời.

**Đầu ra**

- Repository/service transaction và integration test.
- State transition table và reconciliation SQL.
- Báo cáo invariant quota.

### Người 2 — Trash API và validation

**Nội dung**

- Implement bốn endpoint Trash đã chốt.
- Mở rộng quota response với `activeBytes` và `trashBytes`.
- Chuẩn hóa error code: invalid state, expired restore, delete pending.
- Cho phép owner access file trong Trash trước hạn.

**Hướng dẫn**

- Strict JSON/body/method như Phase 1.
- Missing/cross-owner cùng `404`.
- Không trả bucket/object key hoặc purge internals.
- API xóa ngay trả trạng thái async rõ ràng.

**Đầu ra**

- Handler/response/error catalog và unit test.
- Cập nhật API/OpenAPI/Postman.
- Contract test ownership/idempotency.

### Người 3 — Worker permanent-delete và scheduler

**Nội dung**

- Đăng ký handler `permanent_delete`.
- Scanner enqueue item quá `purge_after` theo batch.
- Xóa MinIO object idempotent, hoàn tất metadata/job/audit.
- Retry/backoff/dead-job/recovery theo framework Worker Phase 1.

**Hướng dẫn**

- Không xóa object trước thời hạn.
- Missing object là success có audit/reconciliation.
- Không giữ transaction DB trong lúc gọi MinIO lâu.
- Phải có cơ chế tiếp tục sau crash giữa object delete và DB finalize.

**Đầu ra**

- Handler, repository, scanner và config retention/batch.
- Failure-injection test và recovery runbook.
- Metric purge/dead job.

### Người 4 — QA concurrency và acceptance Trash

**Nội dung**

- Test move, restore, delete ngay, auto purge và preview trong Trash.
- Test text/link/file; object missing; Worker crash; retry.
- Test concurrent restore-vs-purge và delete-vs-preview.
- Test quota breakdown/reconciliation sau mỗi failure point.

**Hướng dẫn**

- Dùng fake clock hoặc clock injection, không sleep 24 giờ.
- Chạy race detector và PostgreSQL/MinIO integration thật.
- Kiểm tra không có orphan reservation/job/ledger.
- Không in presigned URL trong reporter.

**Đầu ra**

- Integration suite, Postman Trash collection và Gate 2 report.
- Matrix state/expected quota.
- Danh sách finding đã đóng.

### Gate 2

- Trash 24 giờ hoạt động cho mọi Item ổn định.
- Restore và purge race-safe.
- Xóa ngay giải phóng quota logic đúng một lần.
- Auto purge xóa binary/metadata theo retry an toàn.
- Quota breakdown và ledger reconcile tuyệt đối khớp.
- Không còn BLOCKER/MAJOR.

## 9. Quy trình 3 — Search, Quota Request và Admin

### Mục tiêu

Bổ sung khả năng tìm nội dung và quy trình tăng quota có quản trị/audit.

### Người 1 — Search/filter repository và index

**Nội dung**

- Mở rộng list active/Trash với `q`, `type`, `from`, `to` và cursor.
- Thiết kế search vector/trigram phù hợp text, title, file name và link.
- Bind cursor với fingerprint filter.
- Benchmark trên dữ liệu tối thiểu 100.000 Item.

**Hướng dẫn**

- Không dùng `%keyword%` không index trên bảng lớn.
- Không thay đổi thứ tự timeline mặc định.
- Query phải scope owner/drive trước search.
- Giới hạn input và thời gian query.

**Đầu ra**

- Repository/index/migration bổ sung nếu cần.
- `EXPLAIN ANALYZE` report và benchmark baseline.
- Unit/integration test cursor + filter.

### Người 2 — User quota-request domain/API

**Nội dung**

- Implement tạo request, đọc request hiện tại và cancel nếu contract cho phép.
- Enforce một pending request, tier hợp lệ và idempotency.
- Tạo notification/outbox boundary, chưa tự gửi notification nếu chưa có integration.

**Hướng dẫn**

- Không cho client cập nhật quota trực tiếp.
- Không dùng số float cho byte.
- Ghi audit request nhưng không ghi reason nhạy cảm vào metric.
- Mọi transition dùng transaction và row lock.

**Đầu ra**

- Domain/repository/API quota request.
- Test duplicate/concurrency/state transition.
- API docs/error catalog.

### Người 3 — Admin service/panel integration

**Nội dung**

- Thêm permission `cloud.quota.review` theo governance hiện có.
- Admin list/filter request, xem quota hiện tại và approve/reject.
- Admin Service gọi Cloud bằng service token; Cloud ghi actor và audit.
- UI có confirm, note và trạng thái xử lý rõ ràng.

**Hướng dẫn**

- Admin JWT không phải authority cuối; Admin Service phải refresh quyền hiện tại.
- Không gọi Cloud DB trực tiếp từ Admin Service/Panel.
- Không cho approve quota thấp hơn consumption.
- Retry approve không được tăng quota lần hai.

**Đầu ra**

- Admin API adapter, permission và panel UI.
- Contract/service-token test.
- Audit evidence approve/reject.

### Người 4 — Audit/metric và Gate 3 QA

**Nội dung**

- Tạo audit writer dùng chung cho user/admin/worker action.
- Thêm metric search latency, quota request và admin review.
- Test privilege escalation, actor spoofing và duplicate approval.
- Viết Postman/E2E cho user-request → admin-review → quota updated.

**Hướng dẫn**

- Audit append-only, không cho client chọn actor.
- Metric label phải bounded, không dùng user ID/item ID làm label.
- Không log request reason hoặc file metadata nhạy cảm.
- Kiểm tra trace bằng request ID xuyên Admin → Cloud.

**Đầu ra**

- Audit/metric implementation và dashboard query.
- Security/acceptance suite.
- Gate 3 report.

### Gate 3

- Search/filter đúng trên active và Trash với cursor ổn định.
- Query đạt performance budget đã chốt.
- User tạo được một pending request.
- Admin đúng quyền approve/reject idempotent.
- Quota và audit thay đổi đúng transaction.
- Không còn BLOCKER/MAJOR.

## 10. Quy trình 4 — Cloud Web Product Experience

### Mục tiêu

Đưa toàn bộ contract Phase 2 lên giao diện giống “My Documents” trong Chat, không
tạo một giao diện Drive độc lập.

### Người 1 — Cloud API client, state và pagination

**Nội dung**

- Mở rộng types/API client cho Auth, Trash, search và quota request.
- Quản lý cursor theo filter, cancellation và stale response.
- Cache file access theo expiry; invalidate khi trash/delete/restore.
- Chuẩn hóa optimistic update và rollback khi API lỗi.

**Hướng dẫn**

- Không để response query cũ ghi đè query mới.
- Không cache presigned URL quá `expiresAt`.
- Không retry mutation không idempotent một cách mù quáng.
- Dùng auth coordinator hiện có.

**Đầu ra**

- API layer/hooks/state và unit test.
- Error mapping/i18n keys.
- Network-state test.

### Người 2 — Timeline, search/filter và delete choices

**Nội dung**

- Thêm search bar và filter theo loại giống Chat resources.
- Menu Item có `Đưa vào Trash` và `Xóa ngay`.
- Modal giải thích tác động quota và cảnh báo xóa vĩnh viễn.
- Timeline update không reload toàn trang.

**Hướng dẫn**

- Giữ message bubble/layout/avatar/header của Chat.
- Không hiển thị bucket/object key.
- Dùng keyboard/focus trap cho menu/modal.
- Test mobile-width dù Phase 2 chưa làm mobile app.

**Đầu ra**

- Timeline/search/filter/delete UI.
- Component test và visual states.
- i18n Việt/Anh.

### Người 3 — Trash, storage và quota-request UI

**Nội dung**

- Trash view có countdown, restore, delete ngay và empty Trash.
- Storage panel hiển thị active/Trash/reserved/available.
- Form request quota và trạng thái review.
- Empty/loading/error/offline state.

**Hướng dẫn**

- Countdown chỉ để hiển thị; server là nguồn quyết định hết hạn.
- Dùng byte integer từ API, format ở UI.
- Empty Trash cần confirm hai bước hoặc confirm có nội dung rõ ràng.
- Không tự tăng quota sau khi submit request.

**Đầu ra**

- Trash/storage/quota-request components.
- Unit/component test cho quota examples và countdown.
- Accessibility labels và i18n.

### Người 4 — Preview regression, E2E và UX QA

**Nội dung**

- Kiểm tra preview ảnh/video/audio/text/PDF trong active và Trash.
- E2E login Hacom → upload → preview → trash → restore → delete.
- Kiểm tra responsive, keyboard, focus, screen reader và reduced motion.
- Kiểm tra download luôn xin access URL hợp lệ.

**Hướng dẫn**

- Không dùng tài khoản/password thật trong repo hoặc report.
- Fixture file nhỏ, không chứa dữ liệu nội bộ.
- Không snapshot presigned URL.
- Tách baseline failure của Chat khỏi regression Cloud.

**Đầu ra**

- Playwright/component test và UX checklist.
- Video/screenshot demo không chứa secret.
- Gate 4 report.

### Gate 4

- Toàn bộ luồng Phase 2 dùng được từ giao diện Chat Web.
- Search/filter, Trash, restore/delete và storage breakdown đúng API.
- Preview không regression.
- Auth/session hoạt động với tài khoản Hacom.
- Responsive/accessibility đạt checklist.
- Không còn BLOCKER/MAJOR.

## 11. Quy trình 5 — Hardening, Release và Demo Phase 2

### Mục tiêu

Kiểm tra chéo dữ liệu, bảo mật, failure recovery và đóng gói release candidate.
Quy trình này không thêm tính năng sản phẩm mới.

### Người 1 — Database/concurrency/reconciliation

- Chạy migration clean, upgrade từ Phase 1, down/up và backfill.
- Stress quota reserve/trash/restore/delete/admin approval đồng thời.
- Reconcile quota snapshot với ledger và Item.
- Đầu ra: release migration script, reconciliation report, test evidence.

### Người 2 — Auth/API security review

- Test JWT/JWKS rotation, revocation, ownership, rate limit và strict validation.
- Test service token/admin permission và fail-closed.
- Review log/response không lộ secret/object key/presigned URL.
- Đầu ra: security report, error catalog, Postman security suite.

### Người 3 — Worker recovery/operations

- Failure injection MinIO/PostgreSQL, crash giữa các bước purge, stale lock/dead job.
- Kiểm tra retry không nhân đôi quota/ledger/audit.
- Hoàn thiện metric, alert, dashboard và recovery runbook.
- Đầu ra: Worker release checklist, soak report, operations runbook.

### Người 4 — E2E, tài liệu và demo

- Chạy full backend/frontend regression và E2E Phase 2.
- Cập nhật README, API/OpenAPI, Postman, deployment và rollback guide.
- Chuẩn bị demo dưới 15 phút và release report có SHA.
- Đầu ra: release report, demo script, slide outline và acceptance matrix.

### Gate 5

- Upgrade từ Phase 1 không mất dữ liệu.
- Full test/race/vet/build/frontend gate/E2E đạt.
- Auth, Trash, quota request, Admin và Worker recovery đều có evidence.
- Reconciliation không lệch quota/ledger/item/object.
- Không có BLOCKER/MAJOR; MINOR có owner và deadline.
- Có rollback plan và demo lặp lại được.
- Chỉ sau Gate 5 mới tạo PR vào `main`.

## 12. Thứ tự thực hiện và phụ thuộc

```text
Gate 0: hợp nhất Phase 1 UI + preview
  ↓
Quy trình 1: baseline + Auth + migration
  ↓ Gate 1
Quy trình 2: Trash lifecycle + Worker purge
  ↓ Gate 2
Quy trình 3: Search + quota request + Admin
  ↓ Gate 3
Quy trình 4: Cloud Web hoàn chỉnh
  ↓ Gate 4
Quy trình 5: hardening + release
  ↓ Gate 5
Phase 2 release candidate
```

Không bắt đầu Quy trình 4 bằng mock contract khác backend. Frontend có thể dựng UI
song song sau khi Gate 2/3 khóa OpenAPI, nhưng chỉ merge khi contract test đạt.

Ước lượng tham khảo với bốn người làm song song trong từng quy trình:

| Quy trình | Ước lượng |
|---|---:|
| Gate 0 + Quy trình 1 | 2–3 ngày làm việc |
| Quy trình 2 | 3–4 ngày làm việc |
| Quy trình 3 | 3–4 ngày làm việc |
| Quy trình 4 | 3–4 ngày làm việc |
| Quy trình 5 | 2–3 ngày làm việc |
| Tổng | 13–18 ngày làm việc |

Ước lượng chỉ có hiệu lực khi không kéo Folder/Share/AI/Mobile/Desktop vào Phase 2.

## 13. Kết quả đầu ra cuối Phase 2

### Sản phẩm

- Người dùng đăng nhập bằng tài khoản Hacom và chỉ truy cập Cloud của chính mình.
- Lưu text/link/file, upload tối đa 100 MB và preview/download an toàn.
- Tìm kiếm/lọc nội dung ngay trong giao diện Chat.
- Chọn đưa vào Trash hoặc xóa ngay.
- Khôi phục trong 24 giờ; Worker tự purge sau thời hạn.
- Dung lượng hiển thị đúng active + Trash + reserved + available.
- Gửi yêu cầu tăng quota và theo dõi trạng thái.
- Admin đúng quyền duyệt/từ chối, có audit đầy đủ.

### Kỹ thuật

- Migration Phase 2 nâng cấp an toàn từ Phase 1.
- JWT/JWKS/revocation và service-token integration.
- Trash/quota transaction race-safe, idempotent và reconcile được.
- Worker permanent-delete có retry/recovery/dead-job handling.
- API/OpenAPI/Postman/README/runbook đồng bộ.
- Metric, audit và dashboard vận hành cơ bản.
- Backend/frontend integration, security và E2E test đạt Gate 5.

### Không được xem là hoàn thành nếu

- Production vẫn chấp nhận `X-Demo-User-ID`.
- Move to Trash làm tăng available quota.
- Restore có thể thắng sau khi purge đã commit.
- Xóa/retry làm trừ quota hai lần.
- Admin Panel sửa trực tiếp database Cloud.
- Preview dùng object key hoặc URL hết hạn lưu lâu dài.
- Cloud UI tách thành giao diện Drive, không còn kế thừa Chat.
- Feature chỉ chạy bằng dữ liệu mock hoặc chỉ đạt unit test.

## 14. Bước bắt đầu ngay

1. Chốt báo cáo này làm scope Phase 2.
2. Tạo Gate 0 để merge backend preview và frontend Cloud UI/preview vào baseline.
3. Tạo nhánh `integration/phase-2-process-1-baseline-auth` từ baseline đã xác nhận.
4. Bốn người công bố file ownership và bắt đầu đúng nhiệm vụ Quy trình 1.
5. Không code Trash/UI mới trước khi JWT và migration contract được review.

