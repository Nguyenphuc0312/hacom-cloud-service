# Hacom Cloud — Gate 1 Integration Report

> Cập nhật: 28/07/2026  
> Nhánh tích hợp: `integration/gate-1`

## Kết luận

Quy trình 1 đã đạt Gate kỹ thuật để chuyển sang Quy trình 2:

- PostgreSQL 16 và MinIO chạy bằng Docker Compose, có health check và volume.
- Bucket `hacom-cloud-private` được tự động tạo với quyền private.
- Bốn migration PostgreSQL chạy được cả `up` và `down`.
- Script kiểm tra xác nhận đủ 9 bảng và các ràng buộc chính.
- Cloud API có liveness/readiness và kiểm tra đúng PostgreSQL cùng bucket MinIO.
- Cloud Worker chạy độc lập, poll job, gọi handler, complete/fail và graceful shutdown.
- Domain enum của Worker được chuẩn hóa theo enum chữ thường trong PostgreSQL.
- Unit test và `go vet` vượt qua.

## Contract Gate 1

| Nội dung | Giá trị hiện tại |
|---|---|
| Database schema | `cloud` |
| MinIO bucket | `hacom-cloud-private` |
| Job statuses | `pending`, `processing`, `completed`, `failed`, `dead` |
| Job types | `verify_upload`, `hash_file`, `virus_scan`, `create_thumbnail`, `cleanup_expired_upload`, `permanent_delete`, `reconcile_quota` |
| Quota demo | `DEFAULT_QUOTA_BYTES=5000000000` |
| Upload limit demo | `MAX_UPLOAD_BYTES=100000000` |
| Trash retention | 24 giờ, vẫn tính quota |

Quota 5 GB decimal và giới hạn 100 MB decimal là cấu hình/giả định demo của nhóm, chưa được coi là yêu cầu sản phẩm chính thức cho đến khi mentor xác nhận.

Payload tối thiểu đã thống nhất cho Worker:

```json
{
  "job_type": "hash_file",
  "payload": {
    "item_id": "<uuid>",
    "object_key": "<private-object-key>"
  }
}
```

```json
{
  "job_type": "cleanup_expired_upload",
  "payload": {
    "session_id": "<uuid>"
  }
}
```

`cloud.jobs.payload` chỉ chứa định danh kỹ thuật, không chứa binary, secret hoặc presigned URL.

## Kết quả kiểm thử

```text
Docker Compose:
  postgres   healthy
  minio      healthy
  minio-init bucket private created

Migration:
  1/u cloud_primitives
  2/u cloud_content
  3/u cloud_upload_and_quota
  4/u cloud_worker_and_audit
  schema verification passed
  4/d → 1/d passed on temporary database

API:
  GET /health/live  → 200 UP
  GET /health       → 200, postgres UP, minio UP
  GET /health/ready → 200, postgres UP, minio UP

Worker:
  started
  claimed gate-1-demo
  demo handler executed
  job completed
  graceful shutdown passed

Quality:
  go test ./... passed
  go vet ./... passed
```

## Cách chạy demo

```bash
cp .env.example .env
make up
make migrate-up
make db-verify
make test
make vet
```

Terminal thứ nhất:

```bash
make run-api
```

Kiểm tra:

```bash
curl http://localhost:8080/health/live
curl http://localhost:8080/health
```

Terminal thứ hai:

```bash
make run-worker
```

Kết thúc demo:

```bash
make down
```

## Ranh giới trước Quy trình 2

Nhánh Worker đã có các service và repository in-memory thử nghiệm cho quota, complete upload, SHA-256 và cleanup. Đây chưa phải persistence hoàn chỉnh:

- Chưa có PostgreSQL repository thật cho Drive, Item, Quota và Job.
- Chưa có API xác thực JWT để xác định owner.
- Chưa có presigned upload API nối thật với MinIO.
- Worker demo chưa claim job từ bảng `cloud.jobs`.

Quy trình 2 nên bắt đầu bằng Personal Cloud/Item/Quota repository trên PostgreSQL và API text/link/timeline. Không sử dụng repository in-memory trong luồng production.
