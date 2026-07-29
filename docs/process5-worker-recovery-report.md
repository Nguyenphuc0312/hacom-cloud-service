# Quy trình 5 — Worker failure và recovery report

> Ngày review: 29/07/2026

## Failure matrix đã khóa

| Trường hợp | Trạng thái cuối mong đợi | Bằng chứng |
|---|---|---|
| 10 Worker claim một job | 1 thắng, 9 `ErrNoJob` | PostgreSQL integration |
| Job chưa tới `run_after` | Không claim | PostgreSQL clock test |
| Handler lỗi tạm thời | `failed`, có `last_error`, hẹn retry | Integration |
| Backoff nhiều lần | 1s, 2s, giữ trần 2s | Integration không sleep |
| Hết `max_attempts` | `dead`, không claim lại | Integration |
| Worker A mất lease | A không complete/fail; B reclaim | Integration |
| Stale job hết lượt | Chuyển `dead`, nhả lock | Integration |
| Worker shutdown giữa job | Context hủy, giữ lease để recover | Unit/race |
| Hash chạy lại | Không thay quota, ready idempotent | Lifecycle integration |
| Cleanup chạy đồng thời | Một release ledger | 8-way integration |
| Object đã mất | Cleanup vẫn thành công | Handler/repository test |
| Ledger insert lỗi | Session/Item/Object/quota rollback | Integration |

## Đối soát

Sau failure/recovery phải chạy:

```bash
docker compose -f deployments/docker-compose.yml exec -T postgres \
  psql -U hacom -d hacom_cloud -f /dev/stdin \
  < scripts/reconcile-process5.sql
```

Không sửa trực tiếp `status`, `attempts`, quota hoặc ledger để cứu demo. Job
`failed` được chờ tới `run_after`; job `dead` được giữ làm audit evidence, sửa
dependency rồi tái tạo tác vụ qua luồng nghiệp vụ đã duyệt.

## Kết luận

Worker Gate 5 vẫn chỉ chạy `hash_file` và `cleanup_expired_upload`. Restart,
retry và stale recovery không tạo quota/ledger/job trùng. Finding
BLOCKER/MAJOR: không có.
