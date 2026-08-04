# Báo cáo phân chia công việc Hacom Cloud — Demo Phase 1

> Cập nhật: 25/07/2026  
> Nhân sự: 4 người  
> Backend: Go  
> Phạm vi: Personal Cloud dạng timeline giống Zalo, chưa kết nối Chat và chưa triển khai Folder CRUD

## Release candidate Quy trình 5

Quy trình 5 khóa phạm vi ở backend Phase 1: text, link, timeline, quota, upload
trực tiếp MinIO, Worker hash và cleanup upload hết hạn. Không có giao diện,
Auth/Chat thật, folder, share, preview, virus scan hay tính năng sản phẩm mới.

Yêu cầu: Go 1.25+, Docker có Compose, `golang-migrate`, `curl` và `jq`. Newman
chỉ cần khi chạy Postman bằng CLI.

Từ một checkout sạch:

```bash
cp .env.example .env
make up
make migrate-up
make db-verify
```

Chạy API và Worker ở hai terminal:

```bash
make run-api
make run-worker
```

Kiểm tra release đầy đủ trên database test riêng:

```bash
make test-release-process5
```

Lệnh này tự tạo/xóa database `hacom_cloud_process5_release_test`, chạy migration
`up → down 1 → up 1`, verify schema, race/integration test, `go vet` và
`go build`. Nó không xóa database `hacom_cloud` hay volume local.

Khi API và Worker đang chạy, có thể chạy demo tự động hoặc Postman:

```bash
make demo-process5
make test-postman-process5
```

Demo không in presigned URL/credential và kiểm tra text, link, upload, Worker
đưa file về `ready`, ownership `404` và quota. Collection Postman tự lấy
`uploadUrl`, session ID và item ID từ response; không hard-code URL đã ký.

Khắc phục lỗi thường gặp:

- `/health/ready` trả `503`: chạy `make ps`, `make logs`, kiểm tra PostgreSQL,
  MinIO và migration.
- API không khởi động: kiểm tra `DATABASE_URL`, `MINIO_*` trong `.env` và port
  `8080`.
- File giữ `processing`: kiểm tra Worker đang chạy, `WORKER_ID` không trùng và
  xem job theo runbook trong `docs/worker-release-checklist.md`.
- `migrate` báo dirty version: không tự sửa bảng; dừng demo, giữ database làm
  bằng chứng và dựng lại database test bằng `make test-release-process5`.
- Port `5432`, `9000`, `9001` bị chiếm: dừng service ngoài phạm vi hoặc đổi
  mapping local trước khi chạy; không đổi contract ứng dụng.

Tài liệu bàn giao:

- Contract và Gate 5: [`docs/README-PROCESS-5.md`](docs/README-PROCESS-5.md)
- API/security: [`docs/process5-api-security-review.md`](docs/process5-api-security-review.md)
- Worker recovery: [`docs/process5-worker-recovery-report.md`](docs/process5-worker-recovery-report.md)
- Demo: [`docs/process5-demo-script.md`](docs/process5-demo-script.md)
- Release report: [`docs/process5-release-report.md`](docs/process5-release-report.md)

## Khởi động local

Yêu cầu: Go 1.25+, Docker và Docker Compose.

```bash
brew install golang-migrate
cp .env.example .env
make up
make migrate-up
make db-verify
make run-api
```

Kiểm tra API tại `http://localhost:8080/health`. Worker có thể chạy ở terminal khác bằng `make run-worker`.

Các lệnh hạ tầng local:

```bash
make up
make down
make logs
make ps
```

Trên Windows nếu chưa cài GNU Make, dùng PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 up
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 ps
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 logs
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 down
```

Nếu bạn dùng Command Prompt, có thể gọi wrapper `.cmd`:

```bat
scripts\dev.cmd up
scripts\dev.cmd ps
scripts\dev.cmd logs
scripts\dev.cmd down
```

Gate 1 đã tích hợp cấu hình, PostgreSQL, MinIO, migration, dependency health API và Worker skeleton. Xem kết quả kiểm thử tại [`docs/gate1-integration-report.md`](docs/gate1-integration-report.md).

Quy trình 2 đã bổ sung PostgreSQL repository thật cho Personal Cloud, text, link, timeline và quota. Xem kiến trúc và cách kiểm thử tại [`docs/process2-implementation.md`](docs/process2-implementation.md).

Quy trình 3 đã bổ sung upload trực tiếp bằng MinIO presigned URL, quota reservation và complete idempotent. Xem [`docs/process3-upload-implementation.md`](docs/process3-upload-implementation.md).

Worker Quy trình 4 đã xử lý `hash_file` và cleanup upload hết hạn. File sau
complete chuyển `processing`, rồi thành `ready` sau khi Worker tính SHA-256.

Phase 2 Quy trình 2 đã hoàn thiện Trash 24 giờ, restore, xóa ngay và Worker
permanent-delete. Chạy Gate 2 trên database cô lập bằng
`make test-trash-gate2`; xem ma trận kết quả và runbook tại
[`docs/phase2-trash-gate2-report.md`](docs/phase2-trash-gate2-report.md) và
[`docs/trash-permanent-delete-recovery-runbook.md`](docs/trash-permanent-delete-recovery-runbook.md).

## 1. Cách tổ chức chung

Cả bốn người cùng làm một quy trình. Chỉ khi đạt Gate chung, cả nhóm mới chuyển sang quy trình tiếp theo.

```text
Quy trình 1 — Nền tảng
→ Gate 1
→ Quy trình 2 — Drive, text, link, quota
→ Gate 2
→ Quy trình 3 — Upload và MinIO
→ Gate 3
→ Quy trình 4 — Worker và lifecycle
→ Gate 4
→ Quy trình 5 — Tích hợp và demo
→ Gate 5
```

Trong mỗi quy trình, bốn người làm bốn nhánh song song trên branch riêng. Interface, DTO, trạng thái và migration phải được thống nhất trước khi bắt đầu code.

Thang độ khó:

```text
1/5: Rất dễ
2/5: Dễ
3/5: Trung bình
4/5: Khó
5/5: Khó nhất, ảnh hưởng trực tiếp tới tính đúng dữ liệu
```

## 2. Quy trình 1 — Xây nền tảng chạy được

### Mục tiêu chung

Dựng được repository Go, PostgreSQL, MinIO, Cloud API và Cloud Worker. Giai đoạn này chưa làm nghiệp vụ hoàn chỉnh.

### Người 1 — ERD và migration đầu tiên

**Độ khó:** 3/5

**Hướng dẫn:**

1. Chốt tên bảng, khóa chính và mối quan hệ với cả nhóm.
2. Tạo thư mục `migrations/`.
3. Viết migration `up` và `down` cho các bảng cốt lõi.
4. Thêm unique constraint và index cần thiết.
5. Chạy migration trên PostgreSQL rỗng và kiểm tra rollback.

**Nội dung công việc:**

- ERD ban đầu.
- `cloud_drives`.
- `cloud_items`.
- `cloud_upload_sessions`.
- `cloud_quotas`.
- `cloud_usage_ledger`.
- `cloud_jobs`.
- Cấu hình `golang-migrate`.

**Đầu ra bàn giao:**

- File ERD.
- Migration up/down chạy được.
- Tài liệu ngắn giải thích từng bảng.
- Lệnh chạy migration trong Makefile hoặc README.

**Cần đạt sau khi hoàn thành:**

- Database rỗng có thể dựng đầy đủ bằng một lệnh.
- Rollback không báo lỗi.
- Các thành viên khác có schema ổn định để code repository/API.

### Người 2 — Scaffold Go API

**Độ khó:** 3/5

**Hướng dẫn:**

1. Khởi tạo `go.mod` và cấu trúc thư mục dự án.
2. Tạo `cmd/api/main.go`.
3. Viết module đọc biến môi trường.
4. Khởi tạo kết nối PostgreSQL và MinIO qua interface.
5. Tạo HTTP router và endpoint `/health`.
6. Thêm graceful shutdown.

**Nội dung công việc:**

- Go API skeleton.
- Config loader.
- Dependency initialization.
- Health check.
- Error response format dùng chung.
- Request ID và logging cơ bản.

**Đầu ra bàn giao:**

- API chạy được bằng `go run ./cmd/api`.
- `GET /health` trả trạng thái API, PostgreSQL và MinIO.
- Mẫu response/error để cả nhóm sử dụng.

**Cần đạt sau khi hoàn thành:**

- API khởi động và tắt đúng cách.
- Thiếu biến môi trường quan trọng thì báo lỗi rõ ràng.
- Health check phát hiện được PostgreSQL hoặc MinIO đang lỗi.

### Người 3 — Scaffold Cloud Worker

**Độ khó:** 3/5

**Hướng dẫn:**

1. Tạo `cmd/worker/main.go`.
2. Định nghĩa `Job`, `JobRepository` và `JobHandler` interface.
3. Tạo vòng lặp polling có thể dừng bằng context.
4. Thêm log khi Worker bắt đầu, dừng và chưa có job.
5. Chưa viết logic SHA-256 ở quy trình này.

**Nội dung công việc:**

- Worker process skeleton.
- Job contract.
- Context cancellation.
- Graceful shutdown.
- Cấu trúc đăng ký nhiều job handler.

**Đầu ra bàn giao:**

- Worker chạy bằng `go run ./cmd/worker`.
- Job interface được cả nhóm duyệt.
- Có mock job handler để chứng minh Worker loop hoạt động.

**Cần đạt sau khi hoàn thành:**

- Worker có thể chạy độc lập với API.
- Worker dừng an toàn khi nhận SIGTERM/SIGINT.
- Sau này thêm `HASH_FILE` và cleanup mà không phải sửa kiến trúc chính.

### Người 4 — Docker Compose và môi trường local

**Độ khó:** 3/5

**Hướng dẫn:**

1. Tạo Docker Compose gồm PostgreSQL và MinIO.
2. Tạo bucket Cloud bằng init container hoặc startup script.
3. Thêm volume để dữ liệu không mất khi restart.
4. Thêm health check cho từng container.
5. Tạo `.env.example`, Makefile và lệnh kiểm tra container.

**Nội dung công việc:**

- PostgreSQL container.
- MinIO và MinIO Console.
- Bucket private cho file Cloud.
- Network và volume.
- Biến môi trường local không chứa secret thật.

**Đầu ra bàn giao:**

- `docker compose up -d` chạy được.
- `.env.example`.
- Makefile với các lệnh `up`, `down`, `logs`, `ps`.
- Hướng dẫn truy cập MinIO Console.

**Cần đạt sau khi hoàn thành:**

- Một thành viên khác clone repo và khởi động hạ tầng được.
- PostgreSQL và MinIO đều healthy.
- Không commit password/secret thật.

### Gate 1

Cả nhóm chỉ chuyển sang Quy trình 2 khi:

- Docker Compose hoạt động.
- Migration up/down hoạt động.
- API `/health` kết nối PostgreSQL và MinIO.
- Worker khởi động độc lập.
- Cả nhóm chốt API contract, trạng thái và job payload.

## 3. Quy trình 2 — Personal Drive, text, link và quota

### Mục tiêu chung

Tạo được Personal Cloud với quota cấu hình, lưu text/link giống Zalo, list timeline và đọc được quota. Giá trị demo hiện tại là 5 GB decimal và chưa phải yêu cầu chính thức.

### Người 1 — Drive và Item Repository

**Độ khó:** 4/5

**Hướng dẫn:**

1. Tạo domain model `Drive` và `CloudItem`.
2. Viết repository bằng `pgx`.
3. Viết hàm ensure drive theo `owner_user_id`.
4. Dùng unique constraint để tránh tạo hai drive cho một user.
5. Viết truy vấn list item theo thời gian, có pagination.

**Nội dung công việc:**

- Auto-create Personal Drive.
- Create text/link item.
- Get item.
- List timeline.
- Pagination theo `created_at` và `id`.

**Đầu ra bàn giao:**

- Drive repository.
- Item repository.
- Unit/integration test cho ensure drive và list timeline.

**Cần đạt sau khi hoàn thành:**

- Một user chỉ có một drive.
- Gọi ensure nhiều lần vẫn trả cùng drive.
- Timeline trả đúng thứ tự và không lặp item giữa các trang.

### Người 2 — API text, link và timeline

**Độ khó:** 3/5

**Hướng dẫn:**

1. Sử dụng repository interface đã thống nhất.
2. Viết API lưu text và link.
3. Validate nội dung rỗng, URL sai định dạng và giới hạn độ dài.
4. Viết API list timeline và lấy chi tiết item.
5. Tạm dùng user ID demo từ middleware local; không hard-code trong handler.

**Nội dung công việc:**

```http
POST /api/v1/cloud/texts
POST /api/v1/cloud/links
GET  /api/v1/cloud/items
GET  /api/v1/cloud/items/{id}
GET  /api/v1/cloud/quota
```

**Đầu ra bàn giao:**

- Handler/service cho text và link.
- DTO request/response.
- Validation và error code.
- API test cơ bản.

**Cần đạt sau khi hoàn thành:**

- Lưu và đọc lại được text/link.
- User không xem được item của user khác.
- Timeline trả về cấu trúc thống nhất cho text, link và file sau này.

### Người 3 — Quota, ledger và transaction

**Độ khó:** 4/5

**Hướng dẫn:**

1. Khi tạo drive, lấy quota từ `DEFAULT_QUOTA_BYTES`.
2. Viết quota repository và ledger repository.
3. Tạo transaction cộng dung lượng text/link.
4. Mỗi Item tạo một ledger entry nội bộ để đối soát dung lượng.
5. Viết API/service đọc quota.

**Nội dung công việc:**

- `cloud_quotas`.
- `cloud_usage_ledger`.
- Cộng dung lượng text/link theo UTF-8 byte.
- Item, quota và ledger cùng commit hoặc cùng rollback.
- `GET /api/v1/cloud/quota`.

**Đầu ra bàn giao:**

- Quota service.
- Ledger repository.
- Test transaction và request đồng thời.
- Test số byte text/link.

**Cần đạt sau khi hoàn thành:**

- Quota mới lấy đúng giá trị cấu hình.
- Hai lần người dùng chủ động lưu cùng nội dung tạo hai Item và đều tính quota.
- `used_bytes` và tổng ledger khớp nhau.

### Người 4 — Test và Postman cho Quy trình 2

**Độ khó:** 3/5

**Hướng dẫn:**

1. Tạo collection theo thứ tự ensure drive → text → link → list → quota.
2. Viết test cho user khác nhau.
3. Chuẩn bị dữ liệu demo dễ hiểu.
4. Ghi lại response mẫu để dùng trong báo cáo.

**Nội dung công việc:**

- Postman collection.
- Environment local.
- Integration test.
- Demo text/link/timeline/quota.

**Đầu ra bàn giao:**

- Collection chạy tự động được.
- Test script kiểm tra status code và response.
- Dữ liệu demo không phụ thuộc thao tác thủ công trong DB.

**Cần đạt sau khi hoàn thành:**

- Một người khác chạy collection và nhận cùng kết quả.
- Có test quyền sở hữu item.
- Có test transaction và quyền sở hữu dữ liệu.

### Gate 2

- Một user chỉ có một Personal Drive.
- Lưu và list được text/link.
- Timeline có pagination.
- Quota mặc định và used quota chính xác.
- Ledger/transaction/concurrency test đạt.
- Postman collection chạy lại được.

## 4. Quy trình 3 — Upload file và MinIO

### Mục tiêu chung

Upload file trực tiếp lên MinIO bằng presigned URL, kiểm tra giới hạn 100 MB, giữ quota trước upload và complete an toàn.

### Người 1 — Upload session và reserve quota

**Độ khó:** 5/5

**Hướng dẫn:**

1. Viết upload session repository.
2. Trong transaction, khóa quota bằng `SELECT ... FOR UPDATE`.
3. Kiểm tra `used + reserved + declared_size <= quota`.
4. Cộng `reserved_bytes` và tạo upload session.
5. Dùng idempotency key để chống tạo session/cộng reserve hai lần.

**Nội dung công việc:**

- Create/get/update upload session.
- Reserve quota.
- Upload session expiry.
- Ledger event `UPLOAD_RESERVED`.
- Transaction rollback khi lỗi.

**Đầu ra bàn giao:**

- Upload session repository/service.
- Test hai request đồng thời.
- Test vượt quota và retry.

**Cần đạt sau khi hoàn thành:**

- Không thể reserve vượt 5 GB dù có request đồng thời.
- Request lỗi không để lại reserved quota.
- Retry không tạo session thứ hai.

### Người 2 — MinIO và presigned URL

**Độ khó:** 5/5

**Hướng dẫn:**

1. Viết Storage interface trước khi viết MinIO adapter.
2. Sinh object key bằng UUID, không dùng trực tiếp tên file.
3. Tạo presigned PUT URL có TTL ngắn.
4. Viết hàm `StatObject`, `GetObject`, `RemoveObject`.
5. Không đưa presigned URL vào log hoặc lưu lâu dài trong DB.

**Nội dung công việc:**

- MinIO adapter.
- Object key policy.
- Presigned upload URL.
- Kiểm tra object metadata.
- Storage test với MinIO local.

**Đầu ra bàn giao:**

- Storage interface và implementation.
- Test upload trực tiếp bằng URL.
- Ví dụ cURL PUT file.

**Cần đạt sau khi hoàn thành:**

- Client PUT file trực tiếp vào MinIO.
- Cloud API không nhận binary file.
- URL hết hạn đúng TTL.
- Object key không bị path traversal hoặc trùng tên.

### Người 3 — Complete upload và tạo job

**Độ khó:** 4/5

**Hướng dẫn:**

1. Nhận upload session ID từ client.
2. Kiểm tra session thuộc user hiện tại và chưa complete.
3. Gọi `StatObject` để lấy size thực tế.
4. So sánh size thực tế với khai báo và giới hạn 100 MB.
5. Trong transaction, tạo file item, chuyển reserved sang used và tạo `HASH_FILE` job.
6. Complete phải idempotent.

**Nội dung công việc:**

- Complete service/handler.
- File item trạng thái `PROCESSING`.
- Ledger finalize.
- Tạo `cloud_jobs` record.
- Compensation khi object không hợp lệ.

**Đầu ra bàn giao:**

- API complete.
- Test complete thành công, retry và sai size.
- File item và job được tạo cùng transaction.

**Cần đạt sau khi hoàn thành:**

- Complete retry trả cùng kết quả.
- Không cộng quota hoặc tạo item/job hai lần.
- File chưa có trên MinIO không thể complete.

### Người 4 — Test luồng upload

**Độ khó:** 4/5

**Hướng dẫn:**

1. Tạo file mẫu nhỏ và script upload.
2. Test initiate → PUT → complete.
3. Test file vượt 100 MB mà không cần upload thật nếu API đã chặn từ metadata.
4. Test size khai báo khác size thực tế.
5. Test presigned URL hết hạn và complete retry.

**Nội dung công việc:**

- Postman/cURL upload workflow.
- Integration tests.
- Negative cases.
- Ghi log và bằng chứng demo.

**Đầu ra bàn giao:**

- Một script chạy trọn luồng upload.
- Bộ test giới hạn, quota và idempotency.
- Checklist lỗi dễ demo.

**Cần đạt sau khi hoàn thành:**

- Happy path chạy ổn định nhiều lần.
- File vượt 100 MB hoặc quota bị chặn.
- Test phát hiện được complete cộng quota trùng nếu có regression.

### Gate 3

- Presigned upload chạy được.
- Binary nằm trong MinIO, metadata nằm trong PostgreSQL.
- Vượt 100 MB hoặc quota bị chặn.
- Complete xác minh size thực tế.
- Complete idempotent.
- Sau complete có file item `PROCESSING` và job `PENDING`.

## 5. Quy trình 4 — Worker và lifecycle

Contract, phân chia công việc và tiêu chí bàn giao chi tiết cho nhóm bốn người:
[`docs/README-PROCESS-4.md`](docs/README-PROCESS-4.md).

### Mục tiêu chung

Worker xử lý job độc lập, tính SHA-256, chuyển file sang `READY`, retry an toàn và cleanup upload hết hạn.

### Người 1 — Job Repository và locking

**Độ khó:** 4/5

**Hướng dẫn:**

1. Viết truy vấn claim job bằng `FOR UPDATE SKIP LOCKED`.
2. Cập nhật `locked_at`, `attempts` và trạng thái trong transaction.
3. Viết hàm complete, retry và failed.
4. Cho phép thu hồi job bị kẹt khi Worker chết.

**Nội dung công việc:**

- Claim job an toàn giữa nhiều Worker.
- Retry scheduling.
- Max attempts.
- Recover stale lock.

**Đầu ra bàn giao:**

- Job repository đầy đủ.
- Test hai Worker không nhận cùng job.
- Test stale job được claim lại.

**Cần đạt sau khi hoàn thành:**

- Không có hai Worker xử lý cùng một job tại cùng thời điểm.
- Worker chết không làm job kẹt vĩnh viễn.
- Job vượt max attempts chuyển `FAILED`.

### Người 2 — Stream MinIO và SHA-256

**Độ khó:** 4/5

**Hướng dẫn:**

1. Dùng `GetObject` để đọc stream, không tải toàn bộ file vào RAM.
2. Tính SHA-256 trong lúc stream.
3. Kiểm tra số byte đọc được so với metadata.
4. Trả về checksum và size cho handler.

**Nội dung công việc:**

- Hash service.
- Streaming an toàn.
- Timeout/context cancellation.
- Test checksum với file mẫu.

**Đầu ra bàn giao:**

- Hàm tính SHA-256 từ object key.
- Unit/integration test checksum.
- Log thời gian xử lý nhưng không log URL bí mật.

**Cần đạt sau khi hoàn thành:**

- File lớn không bị đọc toàn bộ vào RAM.
- Checksum khớp lệnh `sha256sum` của file mẫu.
- Worker hủy xử lý đúng khi context timeout.

### Người 3 — Worker handlers và cleanup

**Độ khó:** 5/5

**Hướng dẫn:**

1. Đăng ký handler `HASH_FILE`.
2. Gọi Hash service và cập nhật item `PROCESSING → READY`.
3. Handler phải idempotent: item đã READY thì không xử lý lại sai.
4. Tạo cleanup job cho upload session hết hạn.
5. Cleanup xóa object tạm, giải phóng reserved quota và ghi ledger.

**Nội dung công việc:**

- `HASH_FILE` handler.
- Retry/backoff.
- Cleanup expired upload.
- Item lifecycle.
- Quota compensation.

**Đầu ra bàn giao:**

- Worker handlers chạy thực tế.
- Log lifecycle rõ ràng.
- Test retry và cleanup.

**Cần đạt sau khi hoàn thành:**

- File thành công chuyển `READY` và có checksum.
- Retry không ghi dữ liệu trùng.
- Upload hết hạn được giải phóng quota.
- Object tạm được xóa theo chính sách.

### Người 4 — Test Worker và khả năng phục hồi

**Độ khó:** 4/5

**Hướng dẫn:**

1. Dừng Worker giữa lúc có job rồi khởi động lại.
2. Tạo job lỗi tạm thời để kiểm tra retry.
3. Tạo upload session hết hạn để kiểm tra cleanup.
4. Kiểm tra trạng thái DB, MinIO và quota sau từng tình huống.

**Nội dung công việc:**

- Restart test.
- Retry test.
- Cleanup test.
- Quota consistency test.
- Log/metrics checklist.

**Đầu ra bàn giao:**

- Bộ test failure/recovery.
- Báo cáo trạng thái trước và sau Worker restart.
- Kịch bản demo Worker rõ ràng.

**Cần đạt sau khi hoàn thành:**

- Worker restart vẫn tiếp tục job.
- Retry không tạo item/ledger trùng.
- Cleanup làm DB, MinIO và quota đồng nhất.

### Gate 4

- API và Worker chạy độc lập.
- SHA-256 chính xác.
- Item chuyển `PROCESSING → READY`.
- Retry và stale job hoạt động.
- Upload hết hạn được cleanup và giải phóng quota.

## 6. Quy trình 5 — Tích hợp và chuẩn bị demo

Contract triển khai chính thức cho Quy trình 5:

- [`docs/README-PROCESS-5.md`](docs/README-PROCESS-5.md)
- [`docs/PROCESS-5-WORK-REPORT.md`](docs/PROCESS-5-WORK-REPORT.md)

Theo yêu cầu của nhóm, cả bốn người commit lên nhánh chung
`integration/process-5-release-demo`; không commit trực tiếp lên `main`.

### Mục tiêu chung

Chạy toàn bộ hệ thống từ môi trường sạch, sửa lỗi tích hợp và chuẩn bị demo dưới 10 phút.

### Người 1 — Concurrency, quota và migration review

**Độ khó:** 5/5

**Hướng dẫn:**

1. Chạy test nhiều initiate/complete đồng thời.
2. Đối chiếu quota với usage ledger.
3. Kiểm tra migration từ database rỗng.
4. Kiểm tra constraint/index và query chậm cơ bản.

**Nội dung công việc:**

- Concurrency test.
- Quota/ledger reconciliation.
- Migration smoke test.
- Review constraint và index.

**Đầu ra bàn giao:**

- Test concurrency.
- Báo cáo đối soát quota.
- Migration release candidate.

**Cần đạt sau khi hoàn thành:**

- Không vượt quota khi request đồng thời.
- Used/reserved khớp ledger.
- Dựng DB sạch không cần sửa tay.

### Người 2 — API validation và bảo mật cơ bản

**Độ khó:** 4/5

**Hướng dẫn:**

1. Chuẩn hóa error code/status code.
2. Kiểm tra ownership ở mọi endpoint.
3. Không log presigned URL, secret hoặc token.
4. Kiểm tra TTL và object key.
5. Thêm giới hạn request cơ bản nếu kịp.

**Nội dung công việc:**

- Chuẩn hóa API error.
- Ownership/authorization checks.
- Input validation.
- Log redaction.
- Presigned URL security review.

**Đầu ra bàn giao:**

- Error catalog.
- Security checklist.
- API tests cho unauthorized/forbidden/invalid input.

**Cần đạt sau khi hoàn thành:**

- User không truy cập dữ liệu của user khác.
- Input sai trả lỗi nhất quán.
- Không lộ secret trong log hoặc response.

### Người 3 — Worker failure/recovery review

**Độ khó:** 4/5

**Hướng dẫn:**

1. Chạy lại toàn bộ failure test.
2. Kiểm tra retry/backoff và max attempts.
3. Kiểm tra stale lock.
4. Đối chiếu object, item, job và quota sau lỗi.

**Nội dung công việc:**

- Worker restart/recovery.
- Retry/backoff/max attempts.
- Stale lock recovery.
- Failure-state reconciliation.

**Đầu ra bàn giao:**

- Worker release checklist.
- Danh sách failure case đã test.
- Hướng dẫn xử lý job failed trong demo.

**Cần đạt sau khi hoàn thành:**

- Không còn job kẹt không rõ nguyên nhân.
- Worker restart an toàn.
- Trạng thái failure hiển thị và giải thích được.

### Người 4 — README, Postman và trình bày

**Độ khó:** 3/5

**Hướng dẫn:**

1. Viết README từ máy sạch: cài đặt, env, migrate, chạy API/Worker.
2. Hoàn thiện Postman collection theo đúng kịch bản demo.
3. Chuẩn bị slide kiến trúc, database, luồng upload và phân công.
4. Quay video demo dự phòng.
5. Tập demo và đo thời gian.

**Nội dung công việc:**

- README vận hành local.
- Postman collection/environment.
- Slide kiến trúc và kết quả.
- Demo script.
- Video dự phòng.

**Đầu ra bàn giao:**

- README hoàn chỉnh.
- Postman collection/environment.
- Slide và demo script.
- Video dự phòng.

**Cần đạt sau khi hoàn thành:**

- Thành viên khác làm theo README và chạy được.
- Demo dưới 10 phút.
- Có phương án tiếp tục khi mạng hoặc công cụ demo lỗi.

### Gate 5

- Luồng end-to-end chạy từ môi trường sạch.
- Test happy path và lỗi chính đều đạt.
- README và Postman sử dụng được.
- Demo dưới 10 phút.
- Không còn lỗi chặn demo.

## 7. Quy trình làm việc mỗi ngày

```text
1. Kick-off 30 phút: chốt contract và bốn nhánh
2. Code song song trên branch riêng
3. Giữa ngày: merge interface/migration dùng chung
4. Cuối ngày: review chéo và chạy Gate
5. Gate đạt: cả nhóm sang quy trình tiếp theo
6. Gate chưa đạt: cả nhóm sửa blocker, không mở feature mới
```

Quy tắc:

- Pull request nhỏ, không trộn nhiều quy trình.
- Không thay đổi interface/DTO âm thầm.
- Migration chỉ có một người sửa tại một thời điểm.
- Mỗi đầu việc phải có test hoặc cách kiểm tra rõ ràng.
- Không merge nếu làm hỏng Gate đã đạt ở quy trình trước.

## 8. Lịch dự kiến

| Thời gian | Nội dung |
|---|---|
| Ngày 1 | Quy trình 1 — Nền tảng |
| Ngày 2 | Quy trình 2 — Drive, text, link, quota |
| Ngày 3 | Quy trình 3 — Upload và MinIO |
| Ngày 4 | Quy trình 4 — Worker và lifecycle |
| Ngày 5 | Quy trình 5 — Tích hợp |
| Ngày 6 | Hoàn thiện báo cáo và tập demo |
| Ngày 7 | Buffer, chỉ sửa lỗi |

## 9. Kết quả cuối cùng cần bàn giao

- Go Cloud API.
- Go Cloud Worker.
- PostgreSQL migration.
- Docker Compose PostgreSQL/MinIO.
- Personal Drive 5 GB.
- Lưu text/link và list timeline.
- Upload tối đa 100 MB bằng presigned URL.
- Quota reservation và usage ledger.
- Worker SHA-256 và cleanup upload hết hạn.
- Test, Postman collection và README.
- Slide, demo script và video dự phòng.
