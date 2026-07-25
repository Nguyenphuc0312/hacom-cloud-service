# Kiến trúc Phase 1

- `cmd/api`: REST API và lifecycle của HTTP server.
- `cmd/worker`: tiến trình xử lý tác vụ nền.
- `internal`: nghiệp vụ nội bộ, không được import từ dự án bên ngoài.
- PostgreSQL lưu metadata, quota, upload session và trạng thái job.
- MinIO lưu nội dung nhị phân của file.
- Phase 1 chưa kết nối Chat, AI, chia sẻ file hoặc Folder/Drive CRUD.

Luồng upload dự kiến: khởi tạo upload → giữ chỗ quota → cấp presigned URL → client tải trực tiếp lên MinIO → xác nhận upload → ghi metadata → worker xử lý hậu kỳ.
