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

Hai UUID demo nằm ở collection variable và không phải credential/Auth thật.
