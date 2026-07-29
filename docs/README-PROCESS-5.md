# Hacom Cloud — Quy trình 5: Release hardening và chuẩn bị demo

> Cập nhật: 29/07/2026  
> Nhân sự: 4 người  
> Nguồn đầu vào: `main` tại Gate 4, merge commit `8f8a2c9`  
> Nhánh làm việc chung: `integration/process-5-release-demo`

## 1. Mục tiêu

Quy trình 5 không mở thêm tính năng sản phẩm. Mục tiêu là biến kết quả của
Quy trình 1–4 thành một release candidate có thể dựng lại, kiểm thử, giải thích
và trình diễn ổn định trong dưới 10 phút.

Kết quả cuối cùng phải chứng minh được:

1. Môi trường sạch khởi động được PostgreSQL, MinIO, API và Worker.
2. Migration chạy `up`, `down`, `up` mà không cần sửa dữ liệu bằng tay.
3. Text, link, timeline, quota và upload không bị regression.
4. Upload file đi hết vòng đời `initiated → completed → processing → ready`.
5. Upload hết hạn được cleanup và hoàn reserved quota đúng một lần.
6. Request đồng thời không làm vượt quota hoặc tạo dữ liệu trùng.
7. Worker retry, stale-lock recovery và trạng thái `dead` giải thích được.
8. Ownership, validation, error response và log không làm lộ dữ liệu nhạy cảm.
9. README và Postman đủ để một thành viên khác chạy lại.
10. Có demo script dưới 10 phút và phương án dự phòng.

Quy trình 5 không triển khai:

- Virus scan, thumbnail, preview hoặc dedup.
- Folder CRUD, share, trash/restore hoặc download API mới.
- Kafka, Chat, Auth thật hoặc AI cá nhân.
- Multipart upload mới.
- Dashboard quản trị job.
- Thay đổi schema chỉ để “đẹp hơn”.

Nếu phát hiện lỗi cần sửa để đạt Gate 5 thì được sửa trong phạm vi hiện có.
Không dùng Quy trình 5 để đưa thêm feature.

## 2. Quy tắc Git bắt buộc

### 2.1. Một nhánh chung duy nhất

Theo yêu cầu của nhóm, cả bốn người **phải commit và push trực tiếp lên cùng
nhánh**:

```text
integration/process-5-release-demo
```

Không commit trực tiếp lên `main`. Không tự tạo nhánh Quy trình 5 khác nếu chưa
được cả nhóm thống nhất.

Trước khi bắt đầu:

```bash
git fetch origin
git switch integration/process-5-release-demo
git pull --ff-only
```

Trước mỗi commit:

1. Thông báo file sắp sửa trong nhóm.
2. Xác nhận không có người khác đang giữ cùng phạm vi file.
3. Kéo commit mới nhất khi worktree đang sạch.
4. Chạy test đúng phạm vi.
5. Chỉ commit các file thuộc nhiệm vụ của mình.

Nếu push bị từ chối vì nhánh đã có commit mới:

```bash
git fetch origin
git rebase origin/integration/process-5-release-demo
```

Giải quyết xung đột tại file nguồn, chạy lại test rồi mới push. Tuyệt đối không
`push --force` hoặc `push --force-with-lease` lên nhánh chung.

### 2.2. Quy ước commit

Commit phải nhỏ, mô tả được một kết quả kiểm tra hoặc một lỗi đã sửa:

```text
test(p5-db): cover concurrent quota reservation
fix(p5-api): normalize upload validation errors
test(p5-worker): verify stale lease recovery
docs(p5-demo): add clean-environment demo script
```

Không dùng commit message chung chung như `update`, `fix`, `done` hoặc gom code
của nhiều người vào một commit.

### 2.3. Quy tắc tránh xung đột

- Mỗi file có một người sở hữu chính trong bảng phân công.
- Chỉ Người 1 được sửa migration trong Quy trình 5.
- Chỉ Người 2 sửa API error mapping và upload validation.
- Chỉ Người 3 sửa Worker/job/lifecycle/cleanup.
- Chỉ Người 4 sửa README, Postman, Makefile và tài liệu demo tổng.
- File dùng chung phải được báo trước và review chéo trước khi push.
- Không thay đổi contract âm thầm để làm test của riêng mình chạy.

## 3. Contract chung đã chốt

Phần này là contract chính thức của Quy trình 5. Nếu code và tài liệu khác nhau,
cả nhóm phải dừng và thống nhất trước khi tiếp tục.

### 3.1. Contract API

Giữ nguyên các endpoint đã hoàn thành:

```http
GET  /health
GET  /health/ready
GET  /health/live

POST /api/v1/cloud/texts
POST /api/v1/cloud/links
GET  /api/v1/cloud/items
GET  /api/v1/cloud/items/:id
GET  /api/v1/cloud/quota

POST /api/v1/cloud/uploads
POST /api/v1/cloud/uploads/:sessionId/complete
```

Contract xác thực local:

```http
X-Demo-User-ID: <uuid>
```

Contract idempotency của upload:

```http
Idempotency-Key: <non-empty, tối đa 128 byte>
```

Error response giữ một định dạng:

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "safe message"
  }
}
```

Quy tắc:

- JSON sai hoặc field lạ trả lỗi `4xx`, không bỏ qua âm thầm.
- Request body vượt giới hạn trả `413`.
- Sai `Content-Type` trả `415`.
- UUID sai trả lỗi validation tương ứng.
- User A không đọc/complete dữ liệu của User B.
- Không dùng response khác nhau để làm lộ sự tồn tại của item/session user khác.
- Không trả stack trace, SQL, object key nội bộ, secret hoặc presigned URL trong
  error/log.

### 3.2. Contract kích thước, quota và ledger

Giữ giá trị demo hiện tại:

```text
DEFAULT_QUOTA_BYTES = 5,000,000,000 byte decimal
MAX_UPLOAD_BYTES    =   100,000,000 byte decimal
MAX_CONTENT_BYTES   =   100,000,000 byte decimal
```

Các bất biến bắt buộc trên từng Drive:

```text
used_bytes >= 0
reserved_bytes >= 0
used_bytes + reserved_bytes <= quota_bytes

used_bytes     = SUM(cloud.usage_ledger.delta_used_bytes)
reserved_bytes = SUM(cloud.usage_ledger.delta_reserved_bytes)
```

Event ledger:

```text
reserve  : delta_used = 0, delta_reserved > 0
commit   : delta_used > 0, delta_reserved < 0
release  : delta_used = 0, delta_reserved < 0
consume  : delta_used > 0, delta_reserved = 0
purge    : delta_used < 0, delta_reserved = 0
```

Idempotency key hiện có không được đổi:

```text
reserve:upload:{session_id}
commit:upload:{session_id}
release:expired-upload:{session_id}
hash_file:{storage_object_id}
cleanup_expired_upload:{session_id}
```

Retry hoặc request đồng thời không được tạo ledger, Item, Storage Object,
Upload Session hoặc active Job trùng.

### 3.3. Contract database và migration

- Không sửa migration `000001`–`000004`.
- Không đổi enum, constraint hoặc index đã release chỉ để làm test dễ hơn.
- Nếu có schema blocker đã được cả nhóm duyệt, Người 1 tạo migration mới:

```text
000005_<muc_dich>.up.sql
000005_<muc_dich>.down.sql
```

- Migration mới phải chạy được trên database rỗng và database đã ở version 4.
- `down` chỉ rollback thay đổi của migration 5.
- Không commit dữ liệu demo, credential hoặc `.env`.
- Query concurrency phải dựa vào transaction/constraint, không dựa vào sleep.

Release candidate phải vượt qua:

```text
database rỗng → migrate up → verify schema
version mới nhất → migrate down 1 → migrate up 1 → verify schema
```

### 3.4. Contract upload và MinIO

- API chỉ nhận metadata; binary được PUT trực tiếp vào MinIO.
- Object key do server sinh:

```text
uploads/{owner_uuid}/{object_uuid}
```

- Client không được truyền bucket hoặc object key.
- Presigned PUT có TTL hữu hạn và ký `Content-Type`, `If-None-Match: *`.
- Complete phải `StatObject` và so kích thước thực tế với metadata.
- File chưa tồn tại, sai size, sai content type hoặc vượt giới hạn không được
  chuyển thành file hợp lệ.
- Không ghi presigned URL, access key, secret key hoặc nội dung file vào log.
- Xóa object không tồn tại trong cleanup được xem là thành công.

### 3.5. Contract Worker và failure recovery

Job Gate 5 vẫn chỉ thực thi:

```text
hash_file
cleanup_expired_upload
```

State machine:

```text
pending → processing → completed
                    └→ failed → processing
                    └→ dead
```

Quy tắc bắt buộc:

- Claim bằng `FOR UPDATE SKIP LOCKED`.
- `attempts` chỉ tăng khi claim thành công.
- Retry dùng exponential backoff và giới hạn `max_attempts`.
- Job hết lượt chuyển `dead`, không nằm `processing` vĩnh viễn.
- Worker mất lease không được complete/fail job.
- Stale lock dùng clock PostgreSQL.
- Handler hash và cleanup phải idempotent.
- Worker shutdown giữa job để lease lại cho stale recovery; không complete giả.
- Không thay đổi quota trong bước hash.

Đối soát sau mỗi failure case:

```text
PostgreSQL Job
↔ Upload Session
↔ Item
↔ Storage Object
↔ MinIO Object
↔ Quota snapshot
↔ Usage Ledger
```

### 3.6. Contract test và bằng chứng

Test không được phụ thuộc thứ tự, dữ liệu của lần chạy trước hoặc thời gian
application sát `NOW()` của PostgreSQL.

Mỗi integration test:

- Dùng UUID riêng.
- Dùng database test riêng.
- Cleanup dữ liệu và object đã tạo.
- Không in presigned URL/credential.
- Có timeout hữu hạn.
- Không dùng `time.Sleep` làm điều kiện đúng duy nhất; phải poll trạng thái với
  deadline khi kiểm tra xử lý bất đồng bộ.

Lệnh Gate 5 bắt buộc:

```bash
gofmt -w ./cmd ./internal
go test -race -count=1 ./...
go vet ./...
go build ./...
sh scripts/test-integration.sh
sh scripts/test-process4-integration.sh
```

Người 1 sẽ bổ sung `scripts/test-process5-release.sh`. Khi file này được merge,
đó là lệnh release cuối cùng của cả nhóm.

## 4. Phân chia công việc

## 4.1. Người 1 — Concurrency, quota, ledger và migration release

Độ khó: **5/5**

Phạm vi file chính:

```text
internal/repository/process5_concurrency_integration_test.go
internal/repository/process5_reconciliation_integration_test.go
scripts/test-process5-release.sh
scripts/verify-schema.sql
docs/process5-database-release-report.md
migrations/000005_*.sql           # chỉ khi có blocker được duyệt
```

Không sửa:

```text
internal/cloudapi/*
internal/upload/service.go
internal/worker/*
tests/postman/*
README.md
Makefile
```

Nhiệm vụ:

1. Test nhiều user tạo Drive đồng thời nhưng mỗi user chỉ có một Drive.
2. Test nhiều initiate cùng idempotency key chỉ tạo một reservation.
3. Test initiate khác key ở sát giới hạn quota; tổng thành công không vượt quota.
4. Test nhiều complete đồng thời chỉ tạo một commit ledger và một hash job.
5. Test complete và cleanup cạnh tranh trên cùng session hết hạn.
6. Test hai Worker/cleanup retry không release quota hai lần.
7. Viết truy vấn đối soát quota snapshot với tổng ledger theo từng Drive.
8. Kiểm tra orphan giữa Item, Storage Object, Upload Session và Job.
9. Chạy migration từ database rỗng và vòng `down/up`.
10. Review constraint/index và `EXPLAIN` các query claim/timeline/expiry chính.
11. Tạo script release chạy migration, race test, integration và cleanup.

Hướng dẫn:

1. Dựng database riêng cho Quy trình 5.
2. Tạo fixture bằng API/repository thật, không insert thiếu quan hệ để làm test
   concurrency.
3. Dùng barrier/channel để phát request đồng thời.
4. Sau khi tất cả goroutine kết thúc, query snapshot và ledger trong cùng một
   thời điểm kiểm tra.
5. Với test race complete/cleanup, chấp nhận đúng một kết quả hợp lệ theo trạng
   thái session; không chấp nhận quota âm hoặc ledger kép.
6. Ghi số lượng request, số thành công, số bị từ chối và trạng thái cuối vào
   báo cáo.

Test bắt buộc:

- 20 goroutine cùng idempotency key.
- Ít nhất 20 reservation cạnh tranh ở biên quota.
- 20 complete retry cho cùng session.
- Reconciliation với text, link, file completed và upload expired.
- Migration `up/down/up`.
- Schema verification sau migration.

Đầu ra bàn giao:

- Bộ concurrency/reconciliation integration test.
- Script `test-process5-release.sh`.
- Báo cáo quota/ledger và migration release candidate.
- Danh sách constraint/index đã review.

Cần đạt:

- Không vượt quota, không quota âm.
- Snapshot khớp tổng ledger.
- Không có orphan hoặc duplicate active job.
- Database sạch dựng được bằng lệnh trong README.

## 4.2. Người 2 — API validation, ownership và bảo mật upload

Độ khó: **4/5**

Phạm vi file chính:

```text
internal/cloudapi/handler.go
internal/cloudapi/handler_test.go
internal/cloudapi/response.go
internal/upload/service.go
internal/upload/service_test.go
internal/storage/minio.go
internal/storage/*_test.go
docs/api.md
docs/process5-api-security-review.md
```

Không sửa:

```text
migrations/*
internal/worker/*
internal/repository/*process5*
tests/postman/*
README.md
Makefile
```

Nhiệm vụ:

1. Lập catalog endpoint → success/error status → error code.
2. Test thiếu/sai `X-Demo-User-ID`.
3. Test User A không list/get/complete Item hoặc Session của User B.
4. Test JSON sai, field lạ, body quá lớn và media type sai.
5. Test UUID, URL, file name, content type, size và idempotency key ở biên.
6. Review response không chứa bucket/object key/secret/presigned URL ngoài
   response initiate hợp lệ.
7. Review log redaction trong API, storage và upload compensation.
8. Kiểm tra TTL presigned URL và signed headers.
9. Kiểm tra object key không nhận input user và không path traversal.
10. Chuẩn hóa message an toàn nhưng giữ machine code ổn định.

Hướng dẫn:

1. Dùng table-driven tests cho toàn bộ error catalog.
2. Mỗi ownership test dùng hai UUID owner độc lập.
3. Capture logger trong test và tìm access key, secret, query signature,
   `X-Amz-Credential`, `X-Amz-Signature`.
4. Không snapshot toàn bộ presigned URL vào test output.
5. Không đổi status/code đã công bố nếu không ghi migration note cho API.

Test bắt buộc:

- Unauthorized/invalid demo user.
- Cross-owner get/complete.
- Unknown JSON field và trailing JSON.
- Body vượt giới hạn.
- File `0`, `100,000,000`, `100,000,001` byte.
- Idempotency key rỗng, tối đa và vượt giới hạn.
- Presigned URL hết hạn/ghi đè bị từ chối.
- Log không chứa secret hoặc presigned signature.

Đầu ra bàn giao:

- Error catalog hoàn chỉnh trong `docs/api.md`.
- Security review checklist.
- Unit/API/integration tests cho validation và ownership.
- Danh sách lỗi đã sửa, không đưa thêm endpoint mới.

Cần đạt:

- Input sai trả lỗi nhất quán.
- User không truy cập dữ liệu user khác.
- Không lộ secret hoặc URL đã ký trong log/error.
- Luồng hợp lệ của Quy trình 2–4 không regression.

## 4.3. Người 3 — Worker failure, recovery và reconciliation

Độ khó: **4/5**

Phạm vi file chính:

```text
internal/worker/job_postgres.go
internal/worker/job_postgres_integration_test.go
internal/worker/worker.go
internal/worker/worker_test.go
internal/worker/handlers/*
internal/repository/file_lifecycle_postgres*.go
internal/repository/upload_cleanup_postgres*.go
docs/worker-release-checklist.md
docs/process5-worker-recovery-report.md
```

Không sửa:

```text
migrations/*
internal/cloudapi/*
internal/upload/service.go
cmd/worker/main.go
tests/postman/*
README.md
Makefile
```

Nhiệm vụ:

1. Chạy lại failure matrix của hash và cleanup.
2. Test MinIO tạm lỗi rồi phục hồi.
3. Test handler timeout và context cancellation.
4. Test Worker shutdown sau claim nhưng trước complete.
5. Test Worker B reclaim stale job của Worker A.
6. Test Worker A không complete/fail sau khi mất lease.
7. Test exponential backoff, giới hạn backoff và `max_attempts`.
8. Test stale job đã hết lượt chuyển `dead`.
9. Test retry hash khi Item/Object đã `ready`.
10. Test checksum hoặc size khác khi đã `ready` trả conflict.
11. Test cleanup khi object MinIO đã mất.
12. Test cleanup transaction rollback khi quota/ledger lỗi.
13. Đối soát trạng thái failure và viết hướng dẫn xử lý `failed/dead`.

Hướng dẫn:

1. Dùng PostgreSQL clock cho `run_after`, lease và stale timeout.
2. Không giảm timeout production chỉ để test chạy nhanh; inject policy riêng
   cho test.
3. Mọi test restart dùng hai `WORKER_ID` khác nhau.
4. Sau failure, query đủ Job/Session/Item/Object/Quota/Ledger.
5. Không sửa DB bằng tay để “giải cứu” job trong happy path.
6. Với job `dead`, ghi rõ nguyên nhân, trạng thái dữ liệu và cách demo tiếp tục.

Test bắt buộc:

- 10 Worker claim một job, chỉ một Worker thắng.
- Job chưa tới `run_after` không được claim.
- Backoff lần 1, 2, 3 đúng và không vượt max.
- Stale lock được reclaim.
- Lease cũ bị từ chối.
- Hết lượt thành `dead`.
- Hash retry idempotent.
- Cleanup retry/concurrency chỉ có một release ledger.
- Object mất vẫn cleanup thành công.
- Transaction lỗi rollback toàn bộ.

Đầu ra bàn giao:

- Worker release checklist cập nhật.
- Failure/recovery integration tests.
- Báo cáo từng failure case trước/sau.
- Runbook xử lý job `failed` và `dead` trong demo.

Cần đạt:

- Không còn job kẹt không rõ nguyên nhân.
- Restart và retry không tạo dữ liệu/ledger trùng.
- Failure state có thể quan sát và giải thích.
- PostgreSQL, MinIO và quota vẫn đối soát được.

## 4.4. Người 4 — Release documentation, Postman và demo

Độ khó: **3/5**

Phạm vi file chính:

```text
README.md
.env.example
Makefile
tests/README.md
tests/postman/Hacom-Cloud-Process-5-Release.postman_collection.json
tests/postman/Hacom-Cloud-Local.postman_environment.json
docs/process5-demo-script.md
docs/process5-release-report.md
docs/process5-slide-outline.md
scripts/demo-process5.sh
```

Không sửa:

```text
migrations/*
internal/repository/*
internal/cloudapi/*
internal/upload/*
internal/worker/*
```

Nhiệm vụ:

1. Làm theo README từ môi trường sạch và sửa mọi bước thiếu.
2. Chuẩn hóa `.env.example`, Makefile và các lệnh API/Worker/test.
3. Tạo Postman Quy trình 5 gồm health, text, link, timeline, quota, initiate,
   complete và các lỗi chính.
4. Viết script demo dưới 10 phút.
5. Chuẩn bị dữ liệu demo ngắn, tên file và nội dung dễ giải thích.
6. Viết slide outline: bài toán, kiến trúc, database, upload, Worker, failure,
   test và phân công.
7. Chuẩn bị phương án khi mạng lỗi, MinIO lỗi hoặc demo live lỗi.
8. Ghi kết quả lệnh release và Postman vào release report.
9. Không commit video dung lượng lớn; ghi đường dẫn lưu trữ nội bộ nếu có.

Hướng dẫn:

1. Bắt đầu từ clone/worktree sạch, không dùng database cũ.
2. README phải ghi prerequisites, env, Docker, migration, API, Worker, test,
   Postman, troubleshooting và cleanup.
3. Postman dùng biến environment; không hard-code UUID, credential hoặc
   presigned URL.
4. Collection tự lấy session/item/upload URL từ response.
5. Demo script phải có mốc thời gian và câu nói chính cho từng bước.
6. Video dự phòng phải dùng cùng commit release candidate.

Test bắt buộc:

- Người khác làm theo README chạy được.
- Postman chạy liên tiếp hai lần trên database sạch.
- Demo live dưới 10 phút.
- Script cleanup không xóa nhầm database/bucket ngoài demo.
- Tình huống API/Worker/MinIO lỗi có hướng dẫn xử lý.

Đầu ra bàn giao:

- README release candidate.
- Postman collection và environment.
- Demo script, slide outline và release report.
- Tham chiếu video dự phòng.

Cần đạt:

- Thành viên khác khởi động hệ thống không cần hỏi tác giả.
- Demo dưới 10 phút và có phương án dự phòng.
- Tài liệu khớp chính xác code/config ở release commit.

## 5. Thứ tự thực hiện trên nhánh chung

### Giai đoạn 1 — Contract freeze

Cả nhóm đọc tài liệu này và xác nhận:

- Endpoint/error code.
- Invariant quota/ledger.
- Job state/retry/lease.
- Phạm vi file từng người.
- Lệnh Gate 5.

Không sửa nghiệp vụ trước khi contract được xác nhận.

### Giai đoạn 2 — Làm song song

```text
Người 1: database/concurrency/release script
Người 2: API/security/error catalog
Người 3: Worker/failure/recovery
Người 4: README/Postman/demo/report
```

Mọi người commit lên `integration/process-5-release-demo`, nhưng không sửa file
ngoài phạm vi. Sau mỗi lần pull thấy contract đổi, phải đọc commit trước khi
tiếp tục.

### Giai đoạn 3 — Review chéo

- Người 1 review transaction quota/cleanup của Người 3.
- Người 2 review MinIO, log redaction và object lifecycle của Người 3.
- Người 3 review concurrency, lease và time semantics của Người 1.
- Người 4 chạy acceptance test như một người dùng mới.

Review finding được phân loại:

```text
BLOCKER: mất dữ liệu, sai quota, lộ secret, không dựng/chạy được, demo hỏng
MAJOR:   contract/API sai, retry/recovery sai, test quan trọng thiếu
MINOR:   tài liệu, message hoặc trải nghiệm chưa rõ nhưng không chặn Gate
```

Không chạy Gate cuối khi còn `BLOCKER` hoặc `MAJOR`.

### Giai đoạn 4 — Release candidate

1. Đóng băng commit trên nhánh chung.
2. Dựng database và bucket test sạch.
3. Chạy script Process 5.
4. Chạy Postman Process 2, 3 và 5.
5. Chạy API/Worker bằng hai process.
6. Chạy demo hash, cleanup và recovery.
7. Đối soát quota/ledger.
8. Tập demo và đo thời gian.
9. Ghi commit SHA và kết quả vào release report.

## 6. Gate 5 — Definition of Done

Gate 5 chỉ đạt khi tất cả mục dưới đây hoàn thành:

- [ ] Bốn người commit đúng nhánh `integration/process-5-release-demo`.
- [ ] Không có commit trực tiếp lên `main`.
- [ ] Database sạch migrate và verify được.
- [ ] Migration `down/up` đạt.
- [ ] Unit test và race detector đạt.
- [ ] PostgreSQL/MinIO integration đạt.
- [ ] Regression Quy trình 2–4 đạt.
- [ ] Concurrency không vượt quota hoặc ghi trùng ledger.
- [ ] Snapshot quota khớp tổng ledger.
- [ ] Ownership và validation API đạt.
- [ ] Log/response không lộ secret hoặc presigned URL.
- [ ] Worker retry/backoff/max attempts đạt.
- [ ] Stale-lock và lost-lease recovery đạt.
- [ ] Hash và cleanup idempotent.
- [ ] Không còn job kẹt `processing`.
- [ ] README được kiểm tra từ môi trường sạch.
- [ ] Postman chạy được và có assertion.
- [ ] Demo live dưới 10 phút.
- [ ] Có slide outline và video/phương án dự phòng.
- [ ] Release report ghi commit SHA và kết quả test.
- [ ] Không còn finding `BLOCKER` hoặc `MAJOR`.

## 7. Kết quả sau khi hoàn thành Quy trình 5

Sau Gate 5, nhóm có:

1. Một release candidate duy nhất, truy vết được bằng commit SHA.
2. Database migration và schema đã kiểm tra cho môi trường sạch.
3. Bộ test concurrency, reconciliation, API security và Worker recovery.
4. Script release tự động kiểm tra toàn bộ hệ thống.
5. README và Postman cho người mới chạy lại.
6. Error catalog, security checklist và Worker runbook.
7. Demo script dưới 10 phút, slide outline và phương án dự phòng.
8. Bằng chứng quota, ledger, PostgreSQL và MinIO nhất quán.
9. Danh sách rõ các giới hạn Phase 1 và công việc dành cho phase sau.

Chỉ sau khi Gate 5 đạt mới tạo PR từ:

```text
integration/process-5-release-demo
```

vào `main`.
