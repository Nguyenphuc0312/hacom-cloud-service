# Checklist phát hành và phục hồi Cloud Worker

## Kiểm tra tự động

- Chạy `go test ./internal/worker/... -count=100`.
- Chạy `go test ./...`.
- Chạy `go vet ./...`.
- Nhiều Worker chạy đồng thời chỉ có một Worker claim được một job.
- Lỗi tạm thời đưa job về `pending` và lên lịch retry theo exponential backoff.
- Job chuyển sang `dead` sau khi đạt `max_attempts` trong PostgreSQL repository.
- Job `processing` có stale lock được claim lại sau khi Worker restart.
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
4. Đưa cùng tác vụ logic vào queue trở lại và giữ nguyên định danh idempotency.
5. Khởi động Worker và xác nhận job chuyển sang `completed`.
6. Chạy lại checklist đối soát trạng thái trước khi tiếp tục demo.

PostgreSQL repository cần sử dụng `FOR UPDATE SKIP LOCKED`, lưu
`run_after`, `locked_at`, `attempts` và `last_error`, đồng thời áp dụng cùng
quy tắc chuyển trạng thái như lifecycle repository in-memory.
