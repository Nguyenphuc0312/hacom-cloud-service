# Quy trình 4 — Người 4: Worker bootstrap, QA và demo

## Phạm vi đã triển khai độc lập

- Đọc toàn bộ Worker config theo contract, gồm Worker ID, polling, timeout,
  retry, stale-lock và cleanup scan.
- Tự sinh `WORKER_ID` theo `hostname + UUID` khi biến môi trường để trống.
- Từ chối cấu hình lock timeout không lớn hơn job timeout.
- Áp dụng timeout riêng cho từng job.
- Khi job timeout, handler trả lỗi và repository nhận `Fail` để lên lịch retry.
- Khi process shutdown, context của handler bị hủy và job đang giữ được để stale
  lock recovery xử lý; Worker không đánh dấu nhầm job là completed.
- Có bootstrap seam đăng ký đúng hai job Gate 4: `hash_file` và
  `cleanup_expired_upload`.
- Cleanup scanner chạy theo interval và batch size đã cấu hình.
- Có test xác minh cả hai handler được đăng ký, timeout hoạt động và shutdown
  không cập nhật sai trạng thái job.

## Trạng thái dependency tích hợp

Tại thời điểm triển khai tài liệu này, codebase chưa có các implementation đã
phân công cho Người 1–3:

- `internal/repository/job_postgres.go`
- `internal/file/hash_service.go`
- `internal/repository/file_lifecycle_postgres.go`
- `internal/repository/upload_cleanup_postgres.go`

Vì vậy `cmd/worker/main.go` chưa được phép giả lập persistence bằng SQL hoặc
MinIO logic riêng. Khi các dependency trên được tích hợp, chỉ thay phần dựng
dependency và truyền chúng vào `newLifecycleWorker`; không đưa nghiệp vụ queue,
hash hoặc lifecycle vào `cmd/worker`.

## Lệnh kiểm tra

```bash
gofmt -w ./cmd ./internal
go test -race -count=1 ./...
go vet ./...
go build ./...
make test-integration-process4
```

## Kết quả race test

Ngày 2026-07-28, toàn bộ package đã đạt:

```bash
go test -race -count=1 ./...
```

Môi trường kiểm tra là Windows/amd64, Go 1.26.5, CGO bật và GCC 16.1.0 từ
MSYS2 UCRT64. Không phát hiện data race.

Script integration luôn tạo database riêng, chạy migration và cleanup database
sau khi kết thúc. Nếu implementation Người 1–3 chưa có, script dừng với mã `2`
và nêu chính xác dependency còn thiếu, thay vì báo Gate 4 thành công giả.

## Kịch bản QA bắt buộc sau khi tích hợp Người 1–3

### Upload và hash

1. Chạy API và Worker thành hai process độc lập.
2. Initiate upload, PUT binary vào MinIO rồi complete upload.
3. Xác nhận Item/Object là `processing` và job `hash_file` là `pending`.
4. Chờ Worker xử lý.
5. Xác nhận Item/Object là `ready`, checksum SHA-256 đúng và job `completed`.
6. Xác nhận quota không thay đổi thêm trong bước hash.

### Hai Worker và stale recovery

1. Chạy Worker A và Worker B với hai `WORKER_ID` khác nhau.
2. Xác nhận một job chỉ được một Worker claim.
3. Dừng Worker đang xử lý trước khi complete.
4. Chờ quá `WORKER_LOCK_TIMEOUT`.
5. Xác nhận Worker còn lại claim lại và hoàn thành job.
6. Xác nhận Worker cũ không complete được sau khi mất lease.

### Retry

1. Làm MinIO tạm thời không khả dụng.
2. Xác nhận handler lỗi, job thành `failed` và `run_after` theo backoff.
3. Khôi phục MinIO và xác nhận job được retry thành công.
4. Lặp lỗi tới `max_attempts` và xác nhận job chuyển `dead`.

### Cleanup

1. Initiate upload nhưng không complete, sau đó làm session hết hạn.
2. Xác nhận scanner chỉ enqueue một job với dedupe key
   `cleanup_expired_upload:{session_id}`.
3. Xác nhận Worker xóa object, session thành `expired`, Item/Object thành
   `failed` và reserved quota được release.
4. Chạy cleanup lần hai.
5. Xác nhận ledger chỉ có một event với idempotency key
   `release:expired-upload:{session_id}` và quota không bị trừ lần hai.

## Tiêu chí không được đánh dấu đạt sớm

Không đánh dấu Gate 4 hoàn thành cho tới khi `go run ./cmd/worker` dùng
PostgreSQL Job Repository và MinIO/lifecycle implementation thật, đồng thời các
assertion PostgreSQL, MinIO, quota, ledger và recovery ở trên đều đạt.
