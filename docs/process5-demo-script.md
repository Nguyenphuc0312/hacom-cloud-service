# Quy trình 5 — Kịch bản demo backend dưới 10 phút

## Chuẩn bị

```bash
cp .env.example .env
make up
make migrate-up
make db-verify
```

Nếu cần bằng chứng release sạch trước buổi demo:

```bash
make test-release-process5
```

## Kịch bản live

Chạy:

```bash
make demo-process5
```

Script tự khởi động API nếu chưa có, khởi động Worker và thực hiện:

| Mốc | Nội dung nói/trình diễn | Thời lượng mục tiêu |
|---:|---|---:|
| 0:00 | Phase 1 là backend Personal Cloud, chưa có UI/Auth thật | 30 giây |
| 0:30 | Readiness kiểm tra PostgreSQL, migration và MinIO | 30 giây |
| 1:00 | Tạo text/link và đọc timeline | 1 phút |
| 2:00 | Initiate chỉ gửi metadata, quota chuyển reserved | 1 phút |
| 3:00 | PUT binary trực tiếp MinIO, API không nhận binary | 1 phút |
| 4:00 | Complete tạo `hash_file`, Worker đưa file `processing → ready` | 2 phút |
| 6:00 | User khác đọc cùng ID nhận 404 | 30 giây |
| 6:30 | Quota về reserved 0 và used tăng đúng | 30 giây |
| 7:00 | Nêu cleanup/retry/stale recovery và bằng chứng Gate 5 | 1 phút |
| 8:00 | Kết luận, giữ 2 phút buffer | 2 phút |

Script không in presigned URL/credential. Dữ liệu temporary và process do
script tạo được cleanup qua trap; dữ liệu nghiệp vụ giữ lại để có thể mở bằng
Postman sau demo.

## Phương án dự phòng

- API live lỗi: trình bày output `make test-release-process5` và release report.
- Postman/Newman cần mạng để cài: dùng `make demo-process5`, chỉ cần curl/jq.
- MinIO lỗi: mở failure matrix Worker, khôi phục container rồi chạy lại; không
  sửa job/quota bằng tay.
- Worker lỗi: Item giữ `processing`; dùng runbook recovery, không tuyên bố ready.
- Không commit video lớn. Video dự phòng phải quay từ đúng release commit; nơi
  lưu video do nhóm cung cấp ngoài repository.
