# Phase 2 Process 1 — JWT/JWKS security evidence

> Phạm vi: Người 1 — Production identity và authorization cho Cloud API.

## Contract đã triển khai

- Production nhận `Authorization: Bearer <access-token>`.
- Chỉ chấp nhận `RS256` hoặc `ES256`; `HS256` là compatibility flag tắt mặc định.
- Public key lấy qua JWKS theo `kid`, cache TTL và singleflight refresh.
- Kiểm tra issuer, audience, expiry, issued-at, `typ/type=access`, UUID `sub`,
  `sid`, `jti`; alias `userId` nếu có phải trùng `sub`.
- Owner repository chỉ lấy từ `auth.Principal`, không lấy từ client.
- Revocation kiểm tra JTI, session invalid-before và user invalid-before trên Redis.
- Redis/revocation lỗi trả `503` và fail closed.
- `AUTH_MODE=demo` bị từ chối khi `APP_ENV` không phải `local|test`.
- Không log access token, Redis URL, secret hoặc nội dung JWKS private.

## Bộ kiểm tra bắt buộc

```bash
go test -race -count=1 ./internal/auth ./internal/config ./internal/cloudapi ./cmd/api
go test -race -count=1 ./...
go vet ./...
go build ./...
```

Kết quả ngày 04/08/2026:

- `make test-release-process5`: **PASSED** đủ 9/9 bước, gồm database sạch,
  migration `up`, `down 1 -> up 1`, schema verification, race/integration,
  reconciliation, vet và build.
- Release gate chạy các package PostgreSQL tuần tự (`go test -p 1`) vì các
  package integration dùng chung một database. Việc này ngăn fixture queue của
  package này bị package worker khác claim; không thay đổi concurrency test bên
  trong từng package và không thay đổi logic Worker production.
- Smoke local ở `AUTH_MODE=demo`: health `200`, quota có demo UUID `200`, thiếu
  identity `401` với `DEMO_USER_REQUIRED`.

Test bao phủ:

- Token hợp lệ RS256 và ES256.
- Token hết hạn, sai issuer/audience/type/algorithm.
- Thiếu `sub`, `sid`, `jti`, `iat`; alias user sai subject.
- Legacy HS256 disabled/enabled rõ ràng.
- JWKS lỗi/không có key/unknown `kid`.
- Concurrent JWKS fetch được coalesce; unknown `kid` kích hoạt refresh.
- Token blacklist, session/user invalid-before và Redis failure.
- Header demo giả không thể thay principal trong JWT mode.

## Lưu ý cutover

JWKS production phải công bố ít nhất một public key RS256/ES256 trước khi tắt
legacy HS256. Nếu endpoint trả key set rỗng và legacy flag tắt, Cloud API dừng
khởi động thay vì chạy ở trạng thái xác thực không an toàn.

Tại thời điểm kiểm tra 04/08/2026, endpoint JWKS production của Hacom Auth trả
key set rỗng. Đây là điều kiện cần xử lý ở Auth Service trước cutover production;
không bật demo mode để né điều kiện này.
