# Hacom Cloud — Quy trình 3 Upload và MinIO

> Nhánh: `feature/process-3-upload-minio`
>
> Phạm vi: single-part upload, presigned URL, quota reservation và complete
>
> Giới hạn: 100 MB decimal (`100,000,000` byte)

## Kết quả triển khai

- API chỉ nhận metadata; binary đi thẳng từ client tới MinIO.
- Object key có dạng `uploads/{owner_uuid}/{object_uuid}`, không dùng tên file.
- Presigned PUT URL mặc định có TTL 15 phút qua `UPLOAD_URL_TTL`.
- Presigned URL ký bắt buộc `If-None-Match: *`; một object key chỉ được PUT lần đầu, không thể dùng lại URL để ghi đè.
- Initiate tạo Item `pending`, Storage Object `reserved`, Upload Session và ledger `reserve` trong cùng transaction.
- Quota sử dụng `reserved_bytes` và khóa `FOR UPDATE`.
- `Idempotency-Key` chống reserve/session trùng; metadata khác với cùng key bị từ chối.
- Complete gọi `StatObject`, kiểm tra tồn tại, giới hạn, size và MIME type thực tế.
- Complete chuyển quota `reserved → used`, tạo ledger `commit`, Item/Object `processing` và job `hash_file/pending` trong cùng transaction.
- Complete retry và concurrent complete trả lại cùng Item/Job.
- File sai size bị đánh dấu failed, release quota bằng ledger và xóa object khỏi MinIO.
- Drive không `active` không được initiate hoặc complete upload; trạng thái được kiểm tra lại trong transaction complete.

Schema Gate 1 đã có đủ bảng và ràng buộc cho luồng này nên Quy trình 3 không sửa migration đã merge.

## Kiến trúc

```text
Client
  │
  ├─ POST /uploads (metadata + Idempotency-Key)
  │      └─ Cloud API → Upload Service → PostgreSQL transaction
  │           ├─ ensure Drive/Quota
  │           ├─ lock Quota
  │           ├─ reserve quota
  │           ├─ Item pending
  │           ├─ Storage Object reserved
  │           ├─ Upload Session initiated
  │           └─ usage_ledger reserve
  │
  ├─ PUT presigned URL ─────────────────────────────→ MinIO
  │
  └─ POST /uploads/{id}/complete
         ├─ MinIO StatObject
         └─ PostgreSQL transaction
              ├─ lock Session + Quota
              ├─ reserved → used
              ├─ Item/Object processing
              ├─ Session completed
              ├─ usage_ledger commit
              └─ hash_file job pending
```

PostgreSQL lưu metadata/trạng thái. MinIO lưu duy nhất binary.

## Invariant transaction

### Initiate

```text
used + reserved + declared_size <= quota
```

Một lỗi ở bất kỳ bước insert/update/ledger nào sẽ rollback toàn bộ Item, Storage Object, Session và quota reservation.

### Complete

Complete chỉ thành công khi:

- Session thuộc user hiện tại.
- Session chưa hết hạn, failed hoặc cancelled.
- Object tồn tại trong đúng bucket/object key.
- Object chưa từng bị ghi đè; MinIO từ chối lần PUT thứ hai bằng precondition.
- `actual_size == declared_size`.
- MIME type của object bằng MIME type đã khai báo.
- Size không vượt `MAX_UPLOAD_BYTES`.

Item, Object, Session, quota, ledger và job cùng commit hoặc cùng rollback.

## Idempotency

- Initiate lần đầu: HTTP `201`.
- Initiate retry cùng key + metadata: HTTP `200`, cùng Session/Item.
- Cùng key + metadata khác: HTTP `409`.
- Complete retry: HTTP `200`, cùng Item/Job.
- Nhiều initiate đồng thời cùng key chỉ tạo một Session và một quota reservation.
- Nhiều complete đồng thời chỉ tạo một ledger commit và một job.
- Không tạo ledger/job hoặc cộng quota lần hai.

## Chạy demo

```bash
make up
make migrate-up
make run-api
```

Terminal khác:

```bash
make test-postman-process3
```

Collection thực hiện trọn luồng:

1. Readiness.
2. Initiate.
3. Retry initiate.
4. Idempotency conflict.
5. PUT 5 byte trực tiếp tới MinIO.
6. Chặn dùng lại URL để ghi đè object.
7. Complete.
8. Retry complete.
9. Kiểm tra ownership.
10. Kiểm tra quota.
11. Chặn file `100,000,001` byte.

## Kiểm thử

```bash
go test -race -count=1 ./...
go vet ./...
go build ./...
make test-integration-clean
make test-postman-process3
govulncheck ./...
```

Integration test PostgreSQL + MinIO bao phủ:

- Happy path và presigned PUT thật.
- Initiate/complete idempotent.
- Nhiều initiate đồng thời cùng key chỉ reserve một lần.
- Nhiều complete đồng thời chỉ commit một lần.
- Ownership isolation.
- Object chưa upload.
- Idempotency conflict.
- MIME type mismatch.
- Hai reserve đồng thời không vượt quota.
- Size mismatch release quota và xóa object.
- Initiate rollback cưỡng bức.
- Complete rollback cưỡng bức.
- Drive suspended không initiate/complete upload.

## Kết quả QA Gate 3

Kết quả xác nhận ngày 2026-07-28:

- `go test -race -count=1 ./...`: đạt.
- Integration PostgreSQL + MinIO: `15/15` đạt, gồm 5 test hồi quy Quy trình 2 và 10 test upload Quy trình 3.
- Postman Quy trình 3: `11/11` request và assertion đạt.
- Postman hồi quy Quy trình 2: `10/10` request và assertion đạt.
- `go vet ./...`, `go build ./...`, Docker build: đạt.
- Migration chạy đủ `up` và `down -all` trên database sạch: đạt.
- `govulncheck ./...`: không tìm thấy lỗ hổng nằm trên đường gọi của mã hiện tại.

## Chủ động chưa triển khai

- Worker thực thi `hash_file`, virus scan, thumbnail hoặc chuyển file thành `ready`.
- Cleanup upload session hết hạn.
- Multipart upload.
- Download presigned URL.
- Xóa/restore, share, version history.
- Dedup/SHA-256 tối ưu dung lượng.
- Chat, Auth JWT, AI cá nhân.

Các phần này thuộc Quy trình 4–5; không được đưa sớm vào Gate 3.

Khi session hết hạn, quota vẫn đang ở `reserved_bytes` cho tới khi worker cleanup của Quy trình 4 release reservation. File không hợp lệ được đánh dấu failed trước khi xóa MinIO; nếu MinIO tạm lỗi, metadata failed vẫn còn để worker cleanup xử lý object mồ côi sau này.
