# Checklist phát hành và phục hồi Cloud Worker

## Kiểm tra tự động

- Chạy `go test ./internal/worker/... -count=100`.
- Chạy `go test ./...`.
- Chạy `go vet ./...`.
- Nhiều Worker chạy đồng thời chỉ có một Worker claim được một job.
- Lỗi tạm thời đưa job về `PENDING` và lên lịch retry theo exponential backoff.
- Job chuyển sang `FAILED` sau khi đạt `max_attempts`.
- Job `PROCESSING` có stale lock được claim lại sau khi Worker restart.
- Job `HASH_FILE` được claim lại không ghi đè item đã ở trạng thái `READY`.
- Cleanup được retry không giải phóng quota hoặc ghi `UPLOAD_RELEASED` hai lần.

## Đối soát trạng thái

Với mỗi upload đã complete, cần kiểm tra:

1. Object tồn tại trong MinIO và kích thước bằng `cloud_items.size_bytes`.
2. Item chỉ ở trạng thái `PROCESSING` khi có job `HASH_FILE` đang chờ hoặc đang xử lý.
3. Item `READY` phải có checksum SHA-256 và job hash tương ứng đã `COMPLETED`.
4. Upload session hết hạn không còn object tạm và không còn reserved quota.
5. `used_bytes` và `reserved_bytes` phải khớp với usage ledger.
6. Không có job nào giữ trạng thái `PROCESSING` lâu hơn lock timeout đã cấu hình.

## Các tình huống lỗi đã review

| Tình huống lỗi | Kết quả phục hồi mong đợi |
|---|---|
| MinIO tạm thời không khả dụng | Handler trả lỗi; job được retry theo backoff |
| Cập nhật database tạm thời thất bại | Job được retry; handler idempotent không tạo dữ liệu trùng |
| Worker dừng trong lúc xử lý | Stale lock hết hạn và Worker khác claim lại job |
| Kích thước khi tính checksum khác metadata của item | Item giữ trạng thái `PROCESSING`; job chuyển `FAILED` sau khi hết số lần retry |
| Cleanup được retry sau khi object đã bị xóa | Xóa object không tồn tại được xem là thành công; quota và ledger chỉ thay đổi một lần |
| Job đạt số lần thử tối đa | Job chuyển sang `FAILED` và giữ lại `last_error` |

## Xử lý job FAILED trong lúc demo

1. Đọc `job_type`, `attempts`, `last_error`, payload và các mốc thời gian.
2. Kiểm tra item hoặc upload session tương ứng, object trong MinIO và quota ledger.
3. Sửa nguyên nhân bên ngoài trước; không tự ý reset job khi chưa xác định nguyên nhân.
4. Đưa cùng tác vụ logic vào queue trở lại và giữ nguyên định danh idempotency.
5. Khởi động Worker và xác nhận job chuyển sang `COMPLETED`.
6. Chạy lại checklist đối soát trạng thái trước khi tiếp tục demo.

PostgreSQL repository cần sử dụng `FOR UPDATE SKIP LOCKED`, lưu
`available_at`, `locked_at`, `attempts` và `last_error`, đồng thời áp dụng cùng
quy tắc chuyển trạng thái như lifecycle repository in-memory.
