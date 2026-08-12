# Phase 2 — Báo cáo phạm vi tạm hoãn do phụ thuộc Hacom Holding DX

Ngày cập nhật: 12/08/2026
Phạm vi được phép hiện tại: `hacom-cloud-service` và frontend `chat-web-client`  
Trạng thái: **frontend đã mở lại; các backend Hacom Holding DX vẫn tạm hoãn**

## 1. Quyết định phạm vi

Nhóm được thay đổi Cloud backend và frontend Chat để tiêu thụ contract Cloud.
Không sửa, merge, push hoặc deploy các backend/repository ngoài quyền sở hữu:

- `chat-auth-service`;
- `chat-infrastructure`;
- `chat-shared-types`;
- `chat-admin-service` và `chat-admin-panel`;
- các service Chat/HR/notification khác của Hacom Holding DX.

Những phần Cloud đã viết để tiêu thụ contract ngoài vẫn được giữ và kiểm thử
fail-closed. Việc tích hợp live chỉ được mở lại khi có quyền can thiệp repository
tương ứng và contract bên ngoài đã sẵn sàng.

## 2. Bằng chứng xác nhận điểm nghẽn

Kiểm tra bằng tài khoản Hacom thật ngày 05/08/2026 cho thấy:

- đăng nhập qua Hacom Holding thành công;
- access token hiện dùng `HS256`, không có `kid`;
- issuer và audience đều là `chat-service`;
- JWKS production trả HTTP `200` nhưng `keys=[]`;
- token và mật khẩu không được ghi vào file hoặc log bàn giao.

Cloud production contract đã khóa ở `RS256|ES256` và chọn public key theo `kid`.
Vì vậy không thể hoàn thành production identity bằng thay đổi riêng trong Cloud.
Không bật HS256 hoặc chia sẻ secret giữa service để lách Gate 1.

Trong local-only demo bridge, tài khoản đã ánh xạ đúng drive có 8 Item và
45.151.291 byte đang dùng. Bốn object MinIO khớp PostgreSQL/checksum, access URL
trả `200`, ranged read trả `206`, và owner khác nhận `404 ITEM_NOT_FOUND`. Bằng
chứng này xác nhận storage/ownership local khỏe nhưng không thay thế live JWT.

## 3. Hạng mục tạm hoãn

| ID | Hạng mục | Repository/đội phụ thuộc | Lý do phải hoãn | Điều kiện mở lại |
|---|---|---|---|---|
| DX-AUTH-01 | Cutover access token sang RS256/ES256 | `chat-auth-service`, đội vận hành Auth | Auth đang phát HS256; JWKS rỗng | Auth phát token bất đối xứng có `kid`; JWKS có public key hợp lệ |
| DX-AUTH-02 | Revocation/account-state live | `chat-auth-service` | Cloud không sở hữu session/account authority và service credential | Có internal verification/account-state endpoints và service client cho Cloud |
| DX-AUTH-03 | Bộ fixture Gate 1 live | Auth integration authority | Một tài khoản production không tạo được bộ fixture an toàn | Có 2 user, expired, refresh, revoked và inactive token từ môi trường integration |
| DX-INFRA-01 | Edge route `/cloud-api`, CORS, rate limit, header stripping | `chat-infrastructure` | Cloud repo không sở hữu gateway production | Được phép thay đổi/deploy Infrastructure và có môi trường smoke test |
| DX-TYPES-01 | Shared types cho contract Cloud Phase 2 | `chat-shared-types` | Cloud Go không được tự publish package Chat | OpenAPI ổn định và owner Shared Types phát hành version mới |
| DX-ADMIN-01 | Quyền `cloud.quota.review`, approve/reject UI | `chat-admin-service/panel`, Auth | Cloud không sở hữu permission hoặc admin UI | Permission được duyệt; Admin có service token/audience/scopes đúng |
| DX-NOTIFY-01 | Notification quota request/review | Chat/notification service | Cloud chỉ có thể tạo outbox boundary, không tự gửi qua service khác | Chốt event contract, retry/ownership và quyền gọi service |
| DX-E2E-01 | E2E login Hacom → Cloud và full release gate | Auth/Web/Infra/Admin | Luồng xuyên service chưa có production identity/gateway/UI hợp lệ | Các mục trên hoàn tất và có môi trường integration được phép dùng |

## 4. Phần Cloud vẫn được tiếp tục

### Quy trình 1

- Giữ JWT/JWKS verifier, principal, fail-closed config và unit test trong Cloud.
- Tiếp tục migration `000005`, schema/backfill/invariant và static contract test.
- Gate 1 được tách thành **Cloud static gate: có thể chạy** và **live cross-service
  gate: tạm hoãn**. Không đổi live failure thành skip/pass.

### Quy trình 2

- Có thể triển khai toàn bộ backend Trash: move, restore, delete-now, purge sau
  24 giờ, quota transaction, ledger, audit, Worker scheduler/retry/recovery.
- Có thể hoàn thành PostgreSQL/MinIO integration, race test và OpenAPI backend.
- UI Trash thuộc phạm vi frontend đang triển khai; E2E production vẫn thuộc
  `DX-E2E-01` vì phụ thuộc Auth/Infrastructure backend.

### Quy trình 3

- Có thể triển khai search/filter repository, index, cursor, benchmark.
- Có thể triển khai quota-request domain/API, state machine, transaction, audit
  và outbox boundary bên Cloud.
- Admin permission/service/panel và gửi notification thật tạm hoãn.

### Frontend/Quy trình 4

- Được triển khai giao diện My Documents, Trash, search, quota breakdown và
  quota-request trong `chat-web-client` trên nhánh riêng.
- Frontend không chứa service credential, không tự quyết định quyền admin và
  không được dùng để tuyên bố backend Auth/Admin/Notification đã tích hợp live.

### Quy trình 5

- Vẫn làm được migration/reconciliation, Cloud API validation, Worker failure
  injection, race/vet/build và operations runbook của riêng Cloud.
- Auth rotation, gateway runtime, Admin, frontend regression và full E2E tạm
  hoãn; vì thế chưa được tuyên bố Phase 2 release candidate hoàn chỉnh.

## 5. Gói bàn giao

Gói nằm tại `handoff/phase2-deferred-hacom-dx/` nay được giữ như **recovery
archive** cho baseline frontend ban đầu và dependency backend ngoài:

- manifest máy đọc được về từng hạng mục hoãn;
- checklist mở lại;
- 6 patch frontend baseline đã áp dụng/review, giữ để phục hồi và đối chiếu;
- SHA-256 cho từng patch;
- hướng dẫn kiểm tra và áp dụng sau khi được cấp quyền.

Các contract Cloud-side liên quan tiếp tục nằm ở:

- `docs/phase2-auth-api-contract.md`;
- `docs/openapi/phase2-cloud-auth.openapi.yaml`;
- `docs/phase2-gate1-runbook.md`;
- `tests/contract/phase2_auth_contract_test.go`;
- `scripts/test-phase2-gate1.sh`.

## 6. Quy tắc mở lại

1. Có xác nhận bằng văn bản về repository/service được phép can thiệp.
2. Fetch baseline mới và review drift trước khi áp dụng patch; không cherry-pick
   mù vào production branch.
3. Không dùng production bearer, password hoặc private signing key làm fixture.
4. Auth integration phải cung cấp JWKS bất đối xứng và fixture có vòng đời kiểm soát.
5. Chạy lại contract, security, ownership, migration và full E2E trước khi đổi
   trạng thái bất kỳ Gate nào thành `PASS`.

## 7. Kết luận

Các backend phụ thuộc Hacom Holding DX đã được tách và đóng gói để đàm phán sau.
Nhóm tiếp tục Phase 2 trong `hacom-cloud-service` và `chat-web-client`; mọi tiêu
chí Auth/Infrastructure/Admin/Notification backend và live cross-service vẫn
giữ **DEFERRED/PENDING**, không coi local demo hay frontend pass là bằng chứng
production.

## 8. Ví dụ dễ hiểu cho phần còn phụ thuộc

- Người dùng bấm “Yêu cầu thêm dung lượng”: Cloud có thể ghi request `pending`,
  nhưng Admin Service phải quyết định `approved` hoặc `rejected`. Cloud không
  được tự sửa quota để thay Admin.
- Người dùng đăng nhập Hacom rồi mở Cloud: Auth Service phải phát token đúng
  chuẩn và gateway phải chuyển token/request đúng tuyến. Cloud không thể lấy
  mật khẩu hay tự ký token thay Auth.
- Người dùng gửi request quota và chờ thông báo: Cloud có thể tạo outbox/event,
  nhưng notification service phải giao thông báo thật và xử lý retry.
- Người dùng mở Cloud từ public frontend: Infrastructure phải cấu hình route,
  CORS, rate limit và header stripping. Chạy local thành công không chứng minh
  public gateway đã đúng.
