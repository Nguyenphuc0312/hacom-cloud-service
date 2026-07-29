# Checklist phát hành và phục hồi Cloud Worker

## Kiểm tra tự động

- Chạy `go test -race -count=1 ./...`.
- Chạy `make test-release-process5`.
- Chạy `go vet ./...` và `go build ./...`.
- Mười Worker chạy đồng thời chỉ có một Worker claim được một job.
- Lỗi tạm thời đưa job về `failed` và lên lịch retry theo exponential backoff.
- Backoff lần 1/2/3 tăng `base → 2×base → max` và không vượt trần.
- Job chuyển sang `dead` sau khi đạt `max_attempts` trong PostgreSQL repository.
- Job `processing` có stale lock được claim lại sau khi Worker restart.
- Worker đã mất lease không được `Complete` hoặc `Fail`.
- Job `hash_file` được claim lại không ghi đè item đã ở trạng thái `ready`.
- Cleanup được retry không giải phóng quota hoặc ghi `UPLOAD_RELEASED` hai lần.

## Đối soát trạng thái

Với mỗi upload đã complete, cần kiểm tra:

1. Object tồn tại trong MinIO và kích thước bằng `cloud_items.size_bytes`.
2. Item chỉ ở trạng thái `processing` khi có job `hash_file` đang chờ hoặc đang xử lý.
3. Item `ready` phải có checksum SHA-256 và job hash tương ứng đã `completed`.
4. Upload session hết hạn không còn object tạm và không còn reserved quota.
5. `used_bytes` và `reserved_bytes` phải khớp với usage ledger.
6. Không có job nào giữ trạng thái `processing` lâu hơn lock timeout đã cấu hình.

## Các tình huống lỗi đã review

| Tình huống lỗi | Kết quả phục hồi mong đợi |
|---|---|
| MinIO tạm thời không khả dụng | Handler trả lỗi; job được retry theo backoff |
| Cập nhật database tạm thời thất bại | Job được retry; handler idempotent không tạo dữ liệu trùng |
| Worker dừng trong lúc xử lý | Stale lock hết hạn và Worker khác claim lại job |
| Kích thước khi tính checksum khác metadata của item | Item giữ trạng thái `processing`; job retry và chuyển `dead` sau khi hết số lần thử |
| Cleanup được retry sau khi object đã bị xóa | Xóa object không tồn tại được xem là thành công; quota và ledger chỉ thay đổi một lần |
| Job đạt số lần thử tối đa | Job chuyển sang `dead` và giữ lại `last_error` |

## Xử lý job `failed`/`dead` trong lúc demo

1. Đọc `job_type`, `attempts`, `last_error`, payload và các mốc thời gian.
2. Kiểm tra item hoặc upload session tương ứng, object trong MinIO và quota ledger.
3. Sửa nguyên nhân bên ngoài trước; không tự ý reset job khi chưa xác định nguyên nhân.
4. Nếu job đang `failed`, chờ `run_after`; Worker sẽ tự claim lại.
5. Nếu job đã `dead`, không sửa `attempts/status` bằng tay. Sửa nguyên nhân,
   tạo lại đúng tác vụ qua luồng nghiệp vụ/recovery đã duyệt với cùng định danh
   logic và giữ job cũ làm audit evidence.
6. Khởi động Worker và xác nhận job mới/chờ retry chuyển `completed`.
7. Chạy `scripts/reconcile-process5.sql` trước khi tiếp tục demo.

PostgreSQL repository cần sử dụng `FOR UPDATE SKIP LOCKED`, lưu
`run_after`, `locked_at`, `attempts` và `last_error`, đồng thời áp dụng cùng
quy tắc chuyển trạng thái như lifecycle repository in-memory.
