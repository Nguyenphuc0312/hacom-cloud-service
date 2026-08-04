# Database design note — Phase 2 baseline

## Phạm vi và quyết định chính

Migration `000005_phase2_quota_baseline` mở rộng schema Phase 1 mà không sửa
`000001`–`000004`. Nó chỉ cung cấp persistence contract cho quota/Trash và quota
request; không chứa API Trash, repository hay transaction nghiệp vụ.

`used_bytes` tiếp tục mang nghĩa tương thích Phase 1: tổng byte đang hoạt động và
byte trong Trash. `trash_bytes` là phần con của `used_bytes`, vì vậy:

```text
active_bytes    = used_bytes - trash_bytes
available_bytes = quota_bytes - used_bytes - reserved_bytes
0 <= trash_bytes <= used_bytes
0 <= used_bytes + reserved_bytes <= quota_bytes
```

Đưa Item vào Trash hoặc restore chỉ dịch chuyển giữa active và Trash, không đổi
`used_bytes` hay `available_bytes`. Permanent delete mới giảm đồng thời
`trash_bytes` và `used_bytes`. Các transaction nghiệp vụ này thuộc quy trình 2.

## Backfill khi nâng cấp Phase 1

Migration khóa `cloud.items` ở `SHARE` mode và `cloud.quotas` ở `ACCESS EXCLUSIVE`
mode trong transaction để có snapshot ổn định. Với từng quota hiện có,
`trash_bytes` được tính bằng tổng `billable_bytes` của Item có `status = 'trashed'`.
`used_bytes` tuyệt đối không bị viết lại.

Nếu dữ liệu cũ có tổng Trash lớn hơn `used_bytes`, migration dừng với
`check_violation` và chỉ dẫn reconciliation. Đây là fail-safe có chủ đích: tự tăng
`used_bytes` sẽ che mất sai lệch ledger/quota và có thể làm vượt quota. Do toàn bộ
migration nằm trong một transaction, lỗi không để lại schema nửa chừng.

Database rỗng cũng đi cùng đường nâng cấp: không có hàng để backfill, sau đó cột
được đặt `DEFAULT 0`, `NOT NULL` và thêm constraint.

## Quota request contract

`cloud.quota_requests` lưu quota hiện tại tại thời điểm yêu cầu và mức quota mong
muốn. Database đảm bảo:

- yêu cầu mới phải lớn hơn quota snapshot hiện tại;
- một drive chỉ có một request `pending`;
- retry cùng `idempotency_key` trên một drive không tạo bản ghi thứ hai;
- request `pending` chưa có reviewer/thời điểm review;
- `approved`/`rejected` phải có reviewer và thời điểm review;
- actor Auth là soft UUID reference, không có foreign key xuyên service.

Tier hợp lệ, quyền admin, locking và cập nhật `cloud.quotas` là rule nghiệp vụ phải
được thực hiện ở service/repository trong các quy trình sau.

Trạng thái dùng type mới `cloud.quota_request_status` gồm `pending`, `approved`,
`rejected`. Không mở rộng enum Phase 1 vì PostgreSQL không hỗ trợ xóa enum value an
toàn khi rollback. Migration down xóa bảng trước rồi xóa trọn type này.

## Index và concurrency

- `cloud_quota_requests_one_pending_per_drive_uq`: arbiter ở database cho race tạo
  hai request pending.
- `cloud_quota_requests_drive_created_idx`: lịch sử request theo drive, ổn định với
  `(created_at DESC, id DESC)`.
- `cloud_quota_requests_pending_review_idx`: hàng đợi admin theo thời gian tạo.
- unique `(drive_id, idempotency_key)`: dedupe retry trong phạm vi owner drive.

## Rollback và mất dữ liệu có chủ đích

`down` xóa `quota_requests`, enum riêng, constraint và `trash_bytes`; `used_bytes`
được giữ nguyên nên schema trở lại contract Phase 1. Dữ liệu request và breakdown
Trash sẽ mất khi rollback — cần export nếu môi trường đã bắt đầu ghi Phase 2.
Rollback không làm giảm quota hay sửa Item.

## Verification và reconciliation

- `scripts/verify-schema.sql`: kiểm tra object, enum, default, constraint, partial
  unique index thông qua hành vi và không có foreign key xuyên service.
- `scripts/reconcile-phase2-quota.sql`: truy vấn read-only; trạng thái khỏe trả về
  0 hàng, sai lệch được gắn nhãn theo Item, ledger hoặc invariant.
- `scripts/test-phase2-migration.sh`: kiểm tra database rỗng, nâng cấp database có
  dữ liệu Phase 1, backfill, constraint và chu kỳ down/up.

Chạy:

```bash
make test-migration-phase2
make db-verify
```
