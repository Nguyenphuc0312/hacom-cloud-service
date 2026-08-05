# Integration tests

Unit test đặt cạnh package Go tương ứng. Test PostgreSQL/MinIO được bỏ qua khi
không có `TEST_DATABASE_URL`; Gate 5 luôn truyền database test riêng nên không
được xem kết quả skip là bằng chứng release.

Chạy toàn bộ release test từ môi trường sạch:

```bash
make test-release-process5
```

Script tạo `hacom_cloud_process5_release_test`, migrate `up/down/up`, chạy
schema verification, race detector, integration, vet và build, sau đó chỉ xóa
database test này.

Chạy Postman sau khi API và Worker đang hoạt động:

```bash
make test-postman-process5
```

Collection `Hacom-Cloud-Process-5-Release.postman_collection.json` chạy theo
thứ tự. Nó tạo text/link, initiate upload, lưu presigned URL trong biến runtime,
PUT 7 byte trực tiếp vào MinIO, complete, poll trạng thái Worker, kiểm tra
ownership, quota và giới hạn 100 MB. Không xuất collection/environment sau khi
chạy vì runtime variable có thể chứa URL đã ký. Makefile bắt buộc Newman chạy
`--silent`, vì CLI reporter mặc định sẽ in đầy đủ request URL ra terminal.

Environment local chỉ chứa:

```text
baseUrl=http://localhost:8080
```

## Phase 2 migration baseline

```bash
make test-migration-phase2
```

Suite creates a dedicated temporary database and verifies Phase 2 migrations on
an empty database and on populated Phase 1 data. It covers backfill/invariants,
down/reapply, and atomic rejection of an unsafe legacy quota snapshot. The test
database is removed when the script exits.

## Trash lifecycle transaction

```bash
make test-trash-integration
```

Suite covers move/restore, 24-hour expiry, cross-owner access, permanent delete,
binary delete job, same-operation retry, full transaction rollback and concurrent
restore-versus-purge. It also proves quota snapshots match used/Trash ledger deltas.

## Trash API contract

```bash
make test-trash-api
```

The API suite covers all four Trash routes, strict empty action bodies and methods,
quota `activeBytes`/`trashBytes`, stable lifecycle error codes, owner-only access,
idempotent retries, async delete responses, and presigned access that never outlives
the Trash `purgeAfter` deadline. The Postman collection is
`tests/postman/Hacom-Cloud-Phase-2-Trash.postman_collection.json`.

## Phase 3 Gate 3

Run the isolated PostgreSQL, migration rollback/recovery, search/quota/audit and
static cross-service contract gate with `make test-gate3`. With live Auth, Admin
Service and Cloud endpoints plus `userToken`/`adminToken` collection variables,
run the seven-step HTTP flow using `make test-postman-phase3`.

The live command requires `PHASE3_USER_TOKEN` and `PHASE3_ADMIN_TOKEN`; optional
overrides are `PHASE3_CLOUD_BASE_URL`, `PHASE3_ADMIN_BASE_URL`,
`PHASE3_QUOTA_TIER_BYTES` and `PHASE3_REJECT_QUOTA_TIER_BYTES`. Use a fresh test
account or choose two configured tiers above its current quota.

Hai UUID demo nằm ở collection variable và không phải credential/Auth thật.

## Phase 2 Gate 1

Gate tổng hợp production identity chạy bằng:

```bash
PHASE2_GATE1_ENV_FILE=/path/to/untracked/phase2-gate1.env make test-gate1
```

Gate này kiểm tra Cloud regression, migration `000005`, Auth, Shared Types,
Web Client, canonical Infrastructure và live JWKS/two-owner contract. Xem
`docs/phase2-gate1-runbook.md` để chuẩn bị clean worktree và token fixture.
Thiếu live input hoặc một test bị skip không được tính là bằng chứng PASS.
