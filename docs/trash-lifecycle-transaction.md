# Trash repository, quota transaction và invariant report

## Phạm vi

Phần này triển khai persistence/service transaction cho move-to-trash, restore và
logical permanent delete. HTTP handler, Trash listing và Worker xóa binary thuộc
các nhiệm vụ tiếp theo. Retention cố định là 24 giờ UTC.

## State transition table

| Operation | Trạng thái đầu | Điều kiện | Trạng thái cuối | `used_bytes` | `trash_bytes` |
|---|---|---|---|---:|---:|
| Move to Trash | `ready` | đúng owner | `trashed` | không đổi | `+billable` |
| Move retry/đã trashed | `trashed` | cùng target | `trashed` | không đổi | không đổi |
| Restore | `trashed` | `now < purge_after` | `ready` | không đổi | `-billable` |
| Restore retry/đã ready | `ready` | cùng target | `ready` | không đổi | không đổi |
| Delete active | `ready` | expected state = `ready` | Item metadata bị xóa | `-billable` | không đổi |
| Delete Trash | `trashed` | expected state = `trashed` | Item metadata bị xóa | `-billable` | `-billable` |
| Auto purge | `trashed` | `now >= purge_after` | Item metadata bị xóa | `-billable` | `-billable` |
| Move từ pending/processing/failed | trạng thái khác | — | từ chối | không đổi | không đổi |
| Restore hết hạn | `trashed` | `now >= purge_after` | từ chối | không đổi | không đổi |

`expected state` là precondition bắt buộc của permanent delete. Nó ngăn một lệnh
purge đang đua với restore tự biến thành “delete active” sau khi restore thắng.

## Lock order và atomic boundary

Mọi write transaction dùng cùng thứ tự:

```text
1. SELECT Item ... FOR UPDATE (đồng thời scope owner)
2. SELECT Quota ... FOR UPDATE
3. UPDATE Storage Object nếu permanent delete binary
4. quota snapshot + usage ledger + audit + operation tombstone
5. cập nhật/xóa Item
6. COMMIT
```

Item lock là arbiter cho restore-vs-purge và các retry đồng thời. Không transaction
nào trong repository này khóa Quota trước Item, tránh chu trình deadlock nội bộ.
Nếu purge thắng, Item bị xóa và restore trả not-found. Nếu restore thắng, purge có
precondition `trashed` trả state conflict. Chỉ một transition tạo evidence.

## Idempotency và permanent delete

Mỗi write yêu cầu `operation_id` không rỗng, tối đa 128 ký tự. Bảng
`cloud.item_lifecycle_operations` có unique `(drive_id, operation_key)` và không có
foreign key tới Item, nên tombstone vẫn tồn tại sau purge. Retry cùng operation trả
kết quả đã lưu với `Applied=false`; không ghi thêm ledger/audit và không trừ quota
lần hai. Dùng lại key cho Item/action khác trả idempotency conflict.

Binary permanent delete chuyển Storage Object sang `delete_pending`, enqueue đúng
một job `permanent_delete`, rồi xóa metadata Item. Job giữ `storage_object_id`; FK
Item tự chuyển `job.item_id` thành null. Text/link không cần job vì không có binary.

## Quota invariant report

Invariant sau mỗi commit:

```text
active_bytes = used_bytes - trash_bytes
0 <= trash_bytes <= used_bytes
0 <= used_bytes + reserved_bytes <= quota_bytes
quota.used_bytes     = SUM(usage_ledger.delta_used_bytes)
quota.trash_bytes    = SUM(usage_ledger.delta_trash_bytes)
quota.reserved_bytes = SUM(usage_ledger.delta_reserved_bytes)
```

Move/restore chỉ đổi `trash_bytes`; `used_bytes` và available quota không đổi.
Permanent delete giảm `used_bytes` đúng một lần và chỉ giảm `trash_bytes` nếu Item
đang trong Trash. Database constraints, row lock, operation tombstone và ledger
unique key cùng bảo vệ invariant; repository vẫn fail transaction nếu snapshot
cũ không đủ byte để thực hiện phép trừ.

Chạy reconciliation read-only:

```bash
docker compose -f deployments/docker-compose.yml exec -T postgres \
  psql -U hacom -d hacom_cloud -f /dev/stdin \
  < scripts/reconcile-trash-lifecycle.sql
```

Database khỏe trả về 0 hàng. Query so sánh quota với cả Item và ba delta ledger,
đồng thời phát hiện negative Trash, `trash > used` và vượt capacity.

## Rollback

Migration `000006` rebuild enum thay vì `ALTER TYPE ADD VALUE`, vì vậy down có thể
khôi phục đúng enum Phase 1. Khi rollback, operation table và các ledger row
`trash/restore` bị loại vì schema cũ không biểu diễn được `delta_trash_bytes`; audit
log vẫn giữ evidence. Ledger `purge` giữ nguyên vì Phase 1 đã hỗ trợ event này.
