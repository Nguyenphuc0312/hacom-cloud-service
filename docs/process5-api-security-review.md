# Quy trình 5 — API validation, ownership và security review

> Ngày review: 29/07/2026

## Kết quả

Contract endpoint và machine error code không đổi. Không có endpoint/tính năng
mới. Các lớp kiểm tra đã có bằng chứng tự động:

- Thiếu hoặc sai `X-Demo-User-ID` trả `401 DEMO_USER_REQUIRED`.
- User khác đọc Item hoặc complete Session nhận `404`, không lộ sự tồn tại.
- Unknown field, trailing JSON và JSON lỗi trả `400 INVALID_JSON`.
- Body quá lớn trả `413 BODY_TOO_LARGE`; media type sai trả `415`.
- Upload 0 và 100,000,001 byte bị từ chối; đúng 100,000,000 byte được nhận.
- Idempotency key rỗng/129 byte bị từ chối; 128 byte được nhận.
- Object key chỉ gồm owner UUID và UUID server sinh, không chứa tên/path client.
- PUT lần hai với URL cũ bị `If-None-Match: *` từ chối.
- Presigned URL có TTL khoảng 15 phút và ký content type.

## Logging và response

Initiate success là response duy nhất chứa presigned URL. Internal error
response luôn dùng safe message `an internal error occurred`.

API logger không serialize error dependency. Log chỉ giữ:

```text
request_id, method, path, owner_user_id, error_type
```

Test đưa URL có `X-Amz-Signature`, access key và secret giả vào error rồi xác
nhận tất cả đều không xuất hiện trong log.

Newman Gate 5 chạy `--silent`: CLI reporter mặc định in request URL và vì vậy
không phù hợp với presigned PUT. Exit code vẫn là acceptance result; output
chi tiết cần lấy từ assertion không chứa URL, không bật verbose trong demo.

## Giới hạn được chấp nhận cho demo

`X-Demo-User-ID` không phải Auth production. Không tuyên bố endpoint này an toàn
trên Internet; thay bằng JWT/Auth middleware ở phase sau mà không đổi
service/repository ownership contract.

Finding BLOCKER/MAJOR: không có.
