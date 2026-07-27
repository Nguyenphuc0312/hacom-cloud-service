# API Phase 1

Endpoint đã có sau Gate 1:

| Method | Path | Mục đích |
|---|---|---|
| `GET` | `/health/live` | Liveness: kiểm tra API process đang hoạt động |
| `GET` | `/health` | Readiness: kiểm tra PostgreSQL và bucket MinIO |
| `GET` | `/health/ready` | Alias readiness dùng cho deployment |

Các API upload, file, quota và xác thực mới chỉ được định hướng; chưa được coi là hợp đồng chính thức cho đến khi nhóm review.
