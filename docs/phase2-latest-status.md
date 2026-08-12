# Hacom Cloud Phase 2 — trạng thái phiên bản hiện tại

Ngày cập nhật: 12/08/2026

## Phiên bản đã commit

- Cloud backend: `integration/phase-2-process-5-release @ 0f18ef4b6fd32c591a954dfc57f2970f9a1199f1`
- Cloud frontend: `integration/phase-2-process-5-release-web @ 41c348967b02900885e00e8c993cc2abf583c07d`
- Shared Types input: `8f5effe8be115e69b0d0cb7f4a79f36ec5c14bc4`

Frontend được push qua `cloud-origin`, backend được push qua remote Cloud.
Không có thay đổi nào được push vào repository/backend Hacom Holding DX.

## Đã có trong phiên bản này

- Lọc Cloud theo text, link, image, video, audio và file bằng API.
- Hủy request và bỏ qua response phân trang cũ khi đổi search/filter.
- Access URL ngắn hạn cho item active và Trash; cache được làm mới khi
  Trash/restore/delete.
- Preview item trong Trash, restore, xóa vĩnh viễn và Empty Trash.
- Storage breakdown gồm active, Trash, reserved và available.
- Trạng thái quota request pending/approved/rejected.
- Idempotency key cho các mutation của Cloud frontend.
- Unit tests cho filter, stale pagination, Empty Trash, access-cache và
  idempotency.
- E2E live được gated bằng biến môi trường, không chứa credential trong repo.
- Dependency audit frontend hiện báo 0 vulnerability.

## Kết quả kiểm thử ngày 12/08/2026

- Cloud frontend: typecheck PASS.
- Cloud frontend: lint PASS, không có lỗi; warning còn lại là baseline của
  repository.
- Cloud frontend: production build và asset gate PASS.
- Cloud frontend: 133 test files PASS, 1 skipped; 1,108 tests PASS, 7 skipped.
- Cloud tests mục tiêu: 35 tests PASS.
- E2E live spec: được compile và skip mặc định khi không có biến môi trường;
  chưa chạy live trong phiên này vì không cung cấp credential/integration
  runtime.
- Cloud backend: `go test -p 1 -race -count=1 ./...` PASS; `go vet ./...` và
  `go build ./...` PASS.
- Backend full release script chưa chạy hết vì Docker daemon trên máy đang tắt.
  Lệnh bị dừng ở bước khởi động PostgreSQL/MinIO, trước khi tạo database test.

## Còn thiếu trước production

Ví dụ: frontend đã có ô “Yêu cầu thêm dung lượng”, nhưng khi người dùng bấm
gửi thì việc duyệt thật vẫn cần Admin Service. Cloud chỉ tạo request và giữ
trạng thái; Cloud không tự cấp quyền quota.

Ví dụ khác: local E2E có thể đăng nhập bằng demo bridge, nhưng production cần
Auth Service phát access token RS256/ES256 có `kid`, JWKS hợp lệ, rồi gateway
chuyển request đúng vào Cloud. Cloud không thể tự sửa Auth hoặc gateway để hoàn
tất luồng đó.

Danh sách deferred chi tiết nằm trong
[`PHASE2-HACOM-DX-DEFERRED-SCOPE.md`](PHASE2-HACOM-DX-DEFERRED-SCOPE.md).
