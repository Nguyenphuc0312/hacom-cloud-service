# Báo cáo khởi động Quy trình 5 — Hacom Cloud

> Ngày lập: 29/07/2026  
> Trạng thái đầu vào: Gate 4 đã merge lên `main`  
> Merge commit Gate 4: `8f8a2c9`

## 1. Kết luận đầu vào

Quy trình 4 đã có trên `origin/main`. API và Worker đã chạy độc lập; luồng hash,
cleanup, retry, stale recovery, PostgreSQL và MinIO đã vượt qua test Gate 4.

Quy trình 5 tập trung vào release hardening, kiểm tra hồi quy và chuẩn bị demo,
không phát triển thêm tính năng sản phẩm.

Contract và hướng dẫn triển khai chi tiết nằm tại:

```text
docs/README-PROCESS-5.md
```

## 2. Nhánh làm việc bắt buộc

Cả bốn người phải commit và push lên cùng nhánh:

```text
integration/process-5-release-demo
```

Yêu cầu bắt buộc:

- Không commit trực tiếp lên `main`.
- Không tự tạo nhánh Quy trình 5 khác khi chưa thống nhất.
- Không force-push nhánh chung.
- Trước khi sửa phải thông báo phạm vi file.
- Commit nhỏ, đúng nhiệm vụ, có test hoặc bằng chứng kiểm tra.
- Push xong phải báo commit SHA cho cả nhóm.

Lệnh bắt đầu:

```bash
git fetch origin
git switch integration/process-5-release-demo
git pull --ff-only
```

## 3. Phân công tóm tắt

| Người | Nhiệm vụ | Độ khó | Đầu ra chính |
|---|---|---:|---|
| Người 1 | Concurrency, quota/ledger reconciliation, migration release | 5/5 | Integration tests, release script, database report |
| Người 2 | API validation, ownership, error catalog, upload security | 4/5 | API/security tests, error catalog, security checklist |
| Người 3 | Worker failure/recovery, retry, stale lease, cleanup reconciliation | 4/5 | Failure tests, Worker checklist, recovery runbook |
| Người 4 | README, Postman, demo, slide và release report | 3/5 | Release docs, collection, demo dưới 10 phút |

Phạm vi file, test bắt buộc, hướng dẫn và Definition of Done của từng người
được chốt trong `docs/README-PROCESS-5.md`.

## 4. Contract không được tự ý thay đổi

- Không đổi endpoint hoặc response format hiện có.
- Không sửa migration `000001`–`000004`.
- Không đổi quota 5 GB decimal hoặc giới hạn 100 MB decimal trong demo.
- Không đổi idempotency key của upload/hash/cleanup.
- Không đổi Job state machine, retry, lease hoặc payload.
- Không log secret, presigned URL hoặc nội dung file.
- Không đưa feature ngoài Phase 1 vào Quy trình 5.

Mọi thay đổi contract phải được cả bốn người xác nhận trước khi commit.

## 5. Kết quả cần đạt

Quy trình 5 hoàn thành khi:

- Môi trường sạch dựng và migrate được.
- Test concurrency/reconciliation đạt.
- API validation, ownership và security đạt.
- Worker failure/recovery đạt.
- Regression Quy trình 2–4 đạt.
- README/Postman chạy được.
- Demo hoàn thành dưới 10 phút.
- Không còn lỗi `BLOCKER` hoặc `MAJOR`.
- Release report có commit SHA và kết quả kiểm tra.

Khi đạt Gate 5, tạo PR từ `integration/process-5-release-demo` vào `main`.
