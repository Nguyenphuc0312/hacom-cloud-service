# Hacom Cloud — README Quy trình 4 cho nhóm 4 người

## 1. Mục tiêu Quy trình 4

Quy trình 4 hoàn thiện Cloud Worker và vòng đời file sau khi Quy trình 3
đã upload thành công.

Kết quả cuối cùng cần đạt:

1. Cloud API và Cloud Worker chạy thành hai process độc lập.
2. Worker claim job thật từ bảng `cloud.jobs`.
3. Nhiều Worker không xử lý trùng cùng một job.
4. Worker đọc file từ MinIO theo stream và tính SHA-256.
5. File chuyển từ `processing` sang `ready`.
6. Job lỗi tạm thời được retry theo backoff.
7. Worker chết giữa chừng không làm job bị kẹt vĩnh viễn.
8. Upload session hết hạn được cleanup.
9. Reserved quota được hoàn lại đúng một lần.
10. PostgreSQL, MinIO, Item, Session, Job và quota luôn đối soát được.

Quy trình 4 không triển khai:

- Virus scan.
- Thumbnail hoặc PDF preview.
- Dedup file.
- Multipart upload.
- Xóa/restore nội dung đã lưu.
- Share.
- Kafka.
- Tích hợp Chat.
- Tích hợp Auth thật.
- AI cá nhân.

Các chức năng trên thuộc quy trình sau. Không đưa sớm vào Gate 4.

## 2. Trạng thái hệ thống trước khi bắt đầu

Quy trình 3 đã có:

- `POST /api/v1/cloud/uploads`.
- Presigned PUT URL tới MinIO.
- Giới hạn một file tối đa `100,000,000` byte decimal.
- Quota mặc định `5,000,000,000` byte decimal.
- Quota reservation trước khi trả upload URL.
- Complete upload idempotent.
- Item và Storage Object chuyển sang `processing`.
- Upload Session chuyển sang `completed`.
- Job `hash_file/pending` được tạo trong cùng transaction complete.
- Object MinIO không thể bị ghi đè bằng cách dùng lại presigned URL.

Worker hiện mới là skeleton và dùng Demo Repository/in-memory. Những file mẫu
này được dùng làm contract tham khảo, không được coi là persistence hoàn chỉnh.

## 3. Quy tắc Git chung

Tất cả thành viên tạo nhánh từ:

```text
feature/process-3-upload-minio
```

Không tạo nhánh Quy trình 4 từ `main`, vì `main` chưa có đầy đủ Quy trình 2–3.

Các nhánh:

```text
feature/p4-job-repository
feature/p4-minio-hash
feature/p4-file-lifecycle
test/p4-worker-integration
```

Nhánh tích hợp:

```text
integration/process-4-worker
```

Quy tắc:

1. Không push trực tiếp lên `main`.
2. Không sửa migration `000001`–`000004` đã được kiểm thử.
3. Nếu bắt buộc thay đổi schema, tạo migration mới `000005_*.sql`.
4. Không commit `.env`, credential, presigned URL hoặc dữ liệu test.
5. Không đổi contract trong tài liệu này nếu chưa được cả nhóm thống nhất.
6. Mỗi nhánh phải có unit test cho phần mình làm.
7. Integration test dùng database riêng và phải cleanup sau khi chạy.

## 4. Contract chung đã thống nhất

Phần này là nguồn contract chính thức cho cả bốn người.

### 4.1. Job type được làm trong Gate 4

```go
const (
    JobHashFile       JobType = "hash_file"
    JobCleanupExpired JobType = "cleanup_expired_upload"
)
```

Các type `virus_scan`, `create_thumbnail`, `permanent_delete` và
`reconcile_quota` đã có trong enum database nhưng chưa được thực thi ở Gate 4.

### 4.2. Trạng thái job

```text
pending
   │ claim
   ▼
processing
   ├── thành công ───────────────→ completed
   ├── lỗi còn có thể retry ─────→ failed ─→ processing
   └── hết max_attempts ─────────→ dead
```

Ý nghĩa:

- `pending`: chưa được Worker nhận.
- `processing`: đang được một Worker giữ lock.
- `failed`: lần chạy trước lỗi nhưng còn được retry.
- `completed`: hoàn thành, trạng thái cuối.
- `dead`: đã hết số lần thử, cần con người kiểm tra.

### 4.3. Job model dùng trong Go

Giữ contract tối thiểu của Worker:

```go
type JobType string

type Job struct {
    ID      string
    Type    JobType
    Payload []byte
}

var ErrNoJob = errors.New("no job available")

type JobRepository interface {
    Claim(ctx context.Context) (Job, error)
    Complete(ctx context.Context, jobID string) error
    Fail(ctx context.Context, jobID string, cause error) error
}
```

PostgreSQL Job Repository giữ `workerID` và `RetryPolicy` trong struct, không
truyền lại hai giá trị này ở mỗi lời gọi:

```go
type RetryPolicy struct {
    MaxAttempts int
    BaseBackoff time.Duration
    MaxBackoff  time.Duration
    LockTimeout time.Duration
}

func NewJobPostgres(
    pool *pgxpool.Pool,
    workerID string,
    policy RetryPolicy,
) (*JobPostgres, error)
```

`Complete` và `Fail` chỉ được cập nhật job khi:

```text
status = processing
locked_by = workerID hiện tại
```

Nếu Worker đã mất lease, repository phải trả lỗi và không thay đổi job.

### 4.4. Quy tắc claim job

Một job được claim khi thỏa một trong hai điều kiện:

```text
status IN (pending, failed)
AND run_after <= NOW()
AND attempts < max_attempts
```

hoặc:

```text
status = processing
AND locked_at < NOW() - lock_timeout
AND attempts < max_attempts
```

Claim phải thực hiện trong một transaction bằng:

```sql
FOR UPDATE SKIP LOCKED
```

Thứ tự ưu tiên:

```text
priority ASC
run_after ASC
created_at ASC
id ASC
```

Khi claim thành công:

```text
status     = processing
attempts   = attempts + 1
locked_by  = workerID
locked_at  = NOW()
last_error = NULL
```

Không được tăng `attempts` ngoài transaction claim.

### 4.5. Quy tắc complete, retry và dead job

Complete:

```text
status       = completed
completed_at = NOW()
locked_by    = NULL
locked_at    = NULL
last_error   = NULL
```

Nếu job đã `completed`, gọi Complete lần nữa phải trả thành công và không sửa
dữ liệu. Với trạng thái khác, Complete chỉ hợp lệ khi Worker hiện tại còn lease.

Fail khi vẫn còn lượt thử:

```text
status     = failed
run_after  = NOW() + backoff
locked_by  = NULL
locked_at  = NULL
last_error = thông báo lỗi đã giới hạn độ dài
```

Fail khi `attempts >= max_attempts`:

```text
status     = dead
locked_by  = NULL
locked_at  = NULL
last_error = nguyên nhân cuối cùng
```

Backoff:

```text
delay = min(base_backoff * 2^(attempts - 1), max_backoff)
```

### 4.6. Payload `hash_file`

Quy trình 3 đã tạo payload:

```json
{
  "item_id": "uuid",
  "storage_object_id": "uuid",
  "upload_session_id": "uuid",
  "object_key": "uploads/{owner_uuid}/{object_uuid}"
}
```

Contract Go:

```go
type HashFilePayload struct {
    ItemID          string `json:"item_id"`
    StorageObjectID string `json:"storage_object_id"`
    UploadSessionID string `json:"upload_session_id"`
    ObjectKey       string `json:"object_key"`
}
```

Mọi ID phải là UUID hợp lệ. Handler không được tin riêng `object_key` từ
payload; phải đối chiếu lại với metadata PostgreSQL.

### 4.7. Hash Service

```go
type HashResult struct {
    Checksum  string
    SizeBytes int64
}

type HashService interface {
    HashObject(
        ctx context.Context,
        objectKey string,
    ) (HashResult, error)
}
```

Quy tắc:

- Đọc MinIO bằng stream.
- Không dùng `io.ReadAll` cho nội dung file.
- SHA-256 trả về lowercase hex gồm đúng 64 ký tự.
- `SizeBytes` là số byte thực tế đã đọc.
- Phải tôn trọng context cancellation.
- Không ghi object data, secret hoặc presigned URL vào log.

### 4.8. Hash target và File Lifecycle Repository

```go
type HashTarget struct {
    ItemID          string
    StorageObjectID string
    UploadSessionID string
    ObjectKey       string
    ExpectedBytes   int64
    ItemStatus      string
    ObjectStatus    string
    Checksum        string
}

type FileLifecycleRepository interface {
    GetHashTarget(
        ctx context.Context,
        payload HashFilePayload,
    ) (HashTarget, error)

    MarkHashReady(
        ctx context.Context,
        target HashTarget,
        result HashResult,
    ) error
}
```

`GetHashTarget` phải xác minh:

- Item, Storage Object và Upload Session thuộc cùng Drive.
- Các ID khớp payload.
- `object_key` trong PostgreSQL khớp payload.
- Upload Session đã `completed`.
- Item và Object đang `processing`, hoặc đã `ready`.

`MarkHashReady` thực hiện trong một transaction:

1. Lock Item và Storage Object.
2. Kiểm tra kích thước thực tế bằng kích thước metadata.
3. Ghi `storage_objects.checksum_sha256`.
4. Chuyển `storage_objects.status = ready`.
5. Chuyển `items.status = ready`.

Idempotency:

- Nếu Item/Object đã `ready` và checksum/size giống nhau: trả thành công.
- Nếu đã `ready` nhưng checksum hoặc size khác: trả lỗi conflict, không ghi đè.
- Không tạo thêm Item, Storage Object, Upload Session hoặc ledger.

### 4.9. Payload cleanup

```json
{
  "session_id": "uuid"
}
```

Contract:

```go
type CleanupExpiredUploadPayload struct {
    SessionID string `json:"session_id"`
}

type CleanupTarget struct {
    SessionID     string
    DriveID       string
    ItemID        string
    StorageObjectID string
    ObjectKey     string
    ReservedBytes int64
    AlreadyCleaned bool
}
```

### 4.10. Cleanup Repository

```go
type CleanupRepository interface {
    EnqueueExpiredUploadJobs(
        ctx context.Context,
        limit int,
    ) (int, error)

    GetCleanupTarget(
        ctx context.Context,
        sessionID string,
    ) (CleanupTarget, error)

    CompleteCleanup(
        ctx context.Context,
        sessionID string,
    ) error
}
```

`EnqueueExpiredUploadJobs`:

- Chỉ chọn session chưa complete và `expires_at <= NOW()`.
- Tạo job `cleanup_expired_upload`.
- Dedupe key:

```text
cleanup_expired_upload:{session_id}
```

- Không tạo nhiều active job cho cùng session.
- Chạy theo batch, không scan không giới hạn.

Trình tự cleanup:

1. Đọc Cleanup Target từ PostgreSQL.
2. Nếu đã cleanup thì trả thành công.
3. Xóa object khỏi MinIO.
4. MinIO không có object vẫn được xem là thành công.
5. Gọi `CompleteCleanup`.

`CompleteCleanup` thực hiện trong một transaction:

1. Lock Upload Session.
2. Nếu session đã `expired`, trả thành công.
3. Chỉ xử lý session chưa complete và đã hết hạn.
4. Lock quota.
5. Trừ đúng `reserved_bytes`.
6. Session chuyển `expired`.
7. Item và Storage Object chuyển `failed`.
8. Ghi một ledger `release`.

Ledger idempotency key:

```text
release:expired-upload:{session_id}
```

Retry không được:

- Trừ quota lần hai.
- Tạo ledger lần hai.
- Tạo Item hoặc Object mới.

### 4.11. Worker runtime

Worker bootstrap phải:

1. Load config.
2. Kết nối PostgreSQL.
3. Kết nối MinIO.
4. Tạo Job Repository với Worker ID riêng.
5. Tạo Hash Service.
6. Tạo lifecycle và cleanup repository.
7. Đăng ký `hash_file`.
8. Đăng ký `cleanup_expired_upload`.
9. Chạy polling loop.
10. Graceful shutdown với `SIGINT/SIGTERM`.

Mỗi job có timeout riêng. Khi timeout, handler trả lỗi để repository retry.

Config đề xuất:

```env
WORKER_ID=
WORKER_POLL_INTERVAL=2s
WORKER_JOB_TIMEOUT=5m
WORKER_LOCK_TIMEOUT=6m
WORKER_MAX_ATTEMPTS=5
WORKER_BASE_BACKOFF=1s
WORKER_MAX_BACKOFF=1m
WORKER_CLEANUP_SCAN_INTERVAL=30s
WORKER_CLEANUP_BATCH_SIZE=100
```

Nếu `WORKER_ID` trống, tạo giá trị từ hostname + UUID khi process khởi động.

## 5. Phân chia công việc

## 5.1. Người 1 — PostgreSQL Job Repository

Nhánh:

```text
feature/p4-job-repository
```

Độ khó: **4/5**

Phạm vi file:

```text
internal/repository/job_postgres.go
internal/repository/job_postgres_integration_test.go
internal/worker/job.go
internal/worker/lifecycle_repository.go
```

Không sửa:

```text
internal/storage/minio.go
internal/worker/handlers/*
cmd/worker/main.go
```

Nhiệm vụ:

1. Chuẩn hóa `Job`, `JobRepository`, error và Retry Policy.
2. Viết PostgreSQL Job Repository.
3. Claim bằng `FOR UPDATE SKIP LOCKED`.
4. Complete job có kiểm tra Worker lease.
5. Fail job và tính exponential backoff.
6. Chuyển job sang `dead` khi hết lượt.
7. Thu hồi stale lock.
8. Giới hạn độ dài `last_error`.
9. Viết integration test concurrency.

Test bắt buộc:

- Hai Worker không claim cùng job.
- Mười Worker đồng thời chỉ một Worker nhận job.
- Job chưa đến `run_after` không được claim.
- Job stale được Worker khác claim lại.
- Worker cũ không complete được sau khi mất lease.
- Fail tạo đúng thời gian retry.
- Job hết lượt chuyển `dead`.
- Complete retry không làm sai trạng thái.

Đầu ra sau khi hoàn thành:

- Worker sử dụng được queue PostgreSQL thật.
- Job không bị xử lý đồng thời.
- Có retry, stale recovery và dead-letter state.
- Repository đáp ứng contract tại mục 4.

## 5.2. Người 2 — MinIO streaming và SHA-256

Nhánh:

```text
feature/p4-minio-hash
```

Độ khó: **3/5**

Phạm vi file:

```text
internal/storage/minio.go
internal/file/hash_service.go
internal/file/hash_service_test.go
internal/file/hash_service_integration_test.go
```

Không sửa:

```text
internal/repository/*
internal/worker/handlers/*
cmd/worker/main.go
```

Nhiệm vụ:

1. Bổ sung API đọc stream object từ MinIO.
2. Viết Hash Service.
3. Tính SHA-256 trong lúc stream.
4. Đếm kích thước thực tế.
5. Tôn trọng context timeout/cancellation.
6. Phân biệt object không tồn tại và lỗi MinIO tạm thời.
7. Không log dữ liệu nhạy cảm.

Test bắt buộc:

- Hash chuẩn của empty stream ở mức Hash Service; Cloud upload hợp lệ vẫn yêu
  cầu file lớn hơn 0 byte.
- Hash của file text nhỏ.
- Hash của file binary mẫu.
- Kích thước trả về chính xác.
- Object không tồn tại.
- Context bị hủy.
- Integration test với MinIO thật.
- Chứng minh không dùng `io.ReadAll`.

Đầu ra sau khi hoàn thành:

- Có Hash Service thực tế dùng MinIO.
- Checksum khớp công cụ chuẩn.
- File lớn không bị tải toàn bộ vào RAM.
- Người 3 có thể inject Hash Service vào handler.

## 5.3. Người 3 — File lifecycle và cleanup

Nhánh:

```text
feature/p4-file-lifecycle
```

Độ khó: **5/5**

Phạm vi file:

```text
internal/worker/handlers/hash_file.go
internal/worker/handlers/cleanup.go
internal/worker/handlers/register.go
internal/repository/file_lifecycle_postgres.go
internal/repository/upload_cleanup_postgres.go
internal/repository/file_lifecycle_postgres_integration_test.go
internal/repository/upload_cleanup_postgres_integration_test.go
```

Không sửa:

```text
internal/repository/job_postgres.go
internal/storage/minio.go
cmd/worker/main.go
```

Nhiệm vụ:

1. Chuẩn hóa typed payload.
2. Xác minh mọi quan hệ từ payload với PostgreSQL.
3. Hoàn thiện `hash_file` handler.
4. Cập nhật Item/Object thành `ready` trong transaction.
5. Bảo đảm retry hash idempotent.
6. Scan session hết hạn và enqueue cleanup job.
7. Cleanup object MinIO.
8. Release reserved quota trong transaction.
9. Ghi ledger idempotent.
10. Bảo đảm retry cleanup không release hai lần.

Trong lúc Người 2 chưa hoàn thành, dùng fake `HashService` theo contract mục 4.7.
Trong lúc Người 1 chưa hoàn thành, test trực tiếp handler/repository mà không
phụ thuộc polling loop.

Test bắt buộc:

- Hash thành công: Item/Object `processing → ready`.
- Checksum và size được lưu đúng.
- Hash retry khi đã `ready`.
- Payload sai quan hệ bị từ chối.
- Checksum khác khi đã ready bị từ chối.
- Session chưa hết hạn không được cleanup.
- Session completed không được cleanup.
- Session hết hạn được release quota.
- Cleanup retry không tạo ledger trùng.
- Object đã mất vẫn cleanup thành công.
- Transaction lỗi thì quota/session/ledger cùng rollback.

Đầu ra sau khi hoàn thành:

- File complete được Worker đưa thành `ready`.
- Metadata và checksum đúng.
- Upload hết hạn được cleanup an toàn.
- PostgreSQL, MinIO và quota giữ được tính nhất quán.

## 5.4. Người 4 — Bootstrap Worker, QA và demo

Nhánh:

```text
test/p4-worker-integration
```

Độ khó: **4/5**

Phạm vi file:

```text
cmd/worker/main.go
internal/config/config.go
internal/config/config_test.go
internal/worker/worker.go
internal/worker/worker_test.go
scripts/test-process4-integration.sh
tests/postman/*
docs/process4-worker-implementation.md
Makefile
.env.example
```

Không sửa implementation repository/hash/lifecycle thuộc Người 1–3, trừ khi
đang sửa lỗi tích hợp đã được người sở hữu file đồng ý.

Nhiệm vụ:

1. Thay Demo Repository bằng PostgreSQL Job Repository.
2. Khởi tạo MinIO Hash Service.
3. Khởi tạo lifecycle và cleanup repository.
4. Đăng ký các handler.
5. Thêm Worker config.
6. Thêm per-job timeout.
7. Graceful shutdown.
8. Tạo clean integration database.
9. Viết test end-to-end API → MinIO → Worker → PostgreSQL.
10. Chuẩn bị script demo và báo cáo QA.

Người 4 bắt đầu ngay bằng fake implementation theo contract. Khi nhánh của
Người 1–3 được tích hợp, chỉ thay constructor/wiring, không thiết kế lại.

Test bắt buộc:

- API và Worker chạy độc lập.
- Upload/complete tạo `hash_file/pending`.
- Worker xử lý và chuyển file thành `ready`.
- Chạy hai Worker không xử lý trùng.
- Dừng Worker sau claim rồi chạy Worker mới.
- Lỗi MinIO tạm thời tạo retry.
- Session hết hạn được cleanup.
- Quota và ledger sau cleanup chính xác.
- Worker shutdown an toàn.
- Quy trình 2–3 không bị regression.

Đầu ra sau khi hoàn thành:

- `go run ./cmd/worker` dùng persistence thật.
- Có script test và demo Gate 4.
- Có báo cáo kết quả trước/sau Worker.
- Nhóm có thể trình diễn toàn bộ lifecycle file.

## 6. Quy trình làm song song

### Giai đoạn 1 — Contract freeze

Cả bốn người cùng:

1. Đọc mục 4.
2. Xác nhận tên type, method và payload.
3. Chạy test Quy trình 3 làm baseline.
4. Tạo bốn nhánh từ cùng commit.

Không ai code nghiệp vụ trước khi contract được xác nhận.

### Giai đoạn 2 — Bốn người làm song song

```text
Người 1 ── Job PostgreSQL
Người 2 ── MinIO Hash Service
Người 3 ── Handler + Lifecycle/Cleanup bằng fake dependency
Người 4 ── Worker bootstrap + test harness bằng fake dependency
```

Không có người nào phải chờ hoàn toàn:

- Người 1 độc lập với MinIO.
- Người 2 độc lập với PostgreSQL Job Queue.
- Người 3 dùng interface/fake.
- Người 4 dựng wiring và test harness bằng interface/fake.

### Giai đoạn 3 — Test và review chéo

Phân công review:

- Người 1 review transaction quota/cleanup của Người 3.
- Người 2 review luồng MinIO delete/hash của Người 3.
- Người 3 review retry, lease và stale lock của Người 1.
- Người 4 kiểm tra acceptance criteria của cả ba.

Mỗi nhánh phải chạy:

```bash
gofmt -w ./cmd ./internal
go test -race -count=1 ./...
go vet ./...
go build ./...
```

### Giai đoạn 4 — Tích hợp

Tạo:

```text
integration/process-4-worker
```

Thứ tự:

1. Tích hợp Người 1.
2. Chạy test Job Repository.
3. Tích hợp Người 2.
4. Chạy test MinIO Hash.
5. Tích hợp Người 3.
6. Chạy test lifecycle/cleanup.
7. Tích hợp Người 4.
8. Chạy toàn bộ unit, race, integration và regression.

Xung đột contract phải được sửa tại nguồn, không vá tạm trong `cmd/worker`.

### Giai đoạn 5 — Cả nhóm hoàn thiện Gate 4

Cả bốn người cùng:

1. Chạy demo từ database sạch.
2. Quan sát trạng thái DB trước và sau Worker.
3. Tắt Worker giữa job và kiểm tra recovery.
4. Tạo session hết hạn và kiểm tra cleanup.
5. Review log không có dữ liệu nhạy cảm.
6. Hoàn thiện tài liệu và checklist.

## 7. Luồng demo bắt buộc

### Demo hash file

```text
1. Client initiate upload
2. Quota reserved
3. Client PUT binary vào MinIO
4. Client complete upload
5. Item/Object = processing
6. Job hash_file = pending
7. Worker claim job
8. Worker stream file và tính SHA-256
9. Item/Object = ready
10. Job = completed
```

Phải chứng minh:

- Binary nằm trong MinIO.
- Checksum trong PostgreSQL đúng.
- Job chỉ được xử lý một lần.
- Quota không thay đổi lần nữa khi hash.

### Demo cleanup upload hết hạn

```text
1. Initiate upload
2. Quota reserved
3. Không complete
4. Session hết hạn
5. Worker enqueue cleanup job
6. Worker xóa object nếu có
7. Session = expired
8. Item/Object = failed
9. Reserved quota được release
10. Ledger có đúng một release event
```

Phải chạy cleanup hai lần để chứng minh idempotency.

### Demo Worker recovery

```text
1. Worker A claim job
2. Dừng Worker A trước khi complete
3. Chờ quá lock timeout
4. Worker B claim lại stale job
5. Worker B hoàn thành
```

Phải chứng minh Worker A không thể complete sau khi mất lease.

## 8. Definition of Done cho Gate 4

Gate 4 chỉ hoàn thành khi tất cả điều kiện dưới đây đạt:

- [ ] API và Worker chạy độc lập.
- [ ] Worker dùng PostgreSQL Job Repository thật.
- [ ] Claim dùng `FOR UPDATE SKIP LOCKED`.
- [ ] Hai Worker không claim cùng job.
- [ ] Có retry, backoff, max attempts và `dead`.
- [ ] Có stale lock recovery.
- [ ] Worker mất lease không cập nhật được job.
- [ ] MinIO được đọc theo stream.
- [ ] SHA-256 chính xác.
- [ ] Item/Object chuyển `processing → ready`.
- [ ] Hash retry idempotent.
- [ ] Session hết hạn được cleanup.
- [ ] Object rác được xóa khỏi MinIO.
- [ ] Reserved quota được release đúng một lần.
- [ ] Ledger không bị ghi trùng.
- [ ] Worker shutdown an toàn.
- [ ] Unit test đạt.
- [ ] Race detector đạt.
- [ ] Integration PostgreSQL + MinIO đạt.
- [ ] Test hồi quy Quy trình 2–3 đạt.
- [ ] Có script demo và báo cáo kết quả.

## 9. Lệnh kiểm tra chung

```bash
make up
make migrate-up
go test -race -count=1 ./...
go vet ./...
go build ./...
```

Chạy API:

```bash
make run-api
```

Chạy Worker ở terminal khác:

```bash
make run-worker
```

Integration script của Quy trình 4 sau khi Người 4 hoàn thành:

```bash
make test-integration-process4
```

Không đánh dấu hoàn thành chỉ vì Worker chạy không lỗi. Phải xác nhận trạng thái
PostgreSQL, MinIO, quota, ledger và job sau từng kịch bản.
