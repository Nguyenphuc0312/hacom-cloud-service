# Kiến trúc Phase 1

- `cmd/api`: REST API và lifecycle của HTTP server.
- `cmd/worker`: tiến trình xử lý tác vụ nền.
- `internal`: nghiệp vụ nội bộ, không được import từ dự án bên ngoài.
- PostgreSQL lưu metadata, quota, upload session và trạng thái job.
- MinIO lưu nội dung nhị phân của file.
- Phase 1 chưa kết nối Chat, AI, chia sẻ file hoặc Folder/Drive CRUD.

Luồng upload dự kiến: khởi tạo upload → giữ chỗ quota → cấp presigned URL → client tải trực tiếp lên MinIO → xác nhận upload → ghi metadata → worker xử lý hậu kỳ.

## Hạ tầng local

```text
Developer
  └─> `make up`
       ├─> PostgreSQL
       │    ├─ metadata, quota, upload session, job state
       │    └─ persistent volume
       ├─> MinIO
       │    ├─ object storage
       │    └─ persistent volume
       └─> minio-init
            └─ create private bucket `hacom-cloud-private`
```

## Checklist bàn giao

- `docker compose up -d` khởi động được PostgreSQL và MinIO.
- PostgreSQL và MinIO có healthcheck.
- Bucket private được tạo tự động.
- Dữ liệu không mất khi restart nhờ volume.
- Có lệnh `make up`, `make down`, `make logs`, `make ps`.
