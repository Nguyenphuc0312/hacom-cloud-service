# Quy trình 5 — Database, concurrency và reconciliation

> Ngày review: 29/07/2026  
> Phạm vi: PostgreSQL/MinIO backend Phase 1

## Kết luận

Không cần migration `000005`: bốn migration đã release đáp ứng Gate 5 và không
có schema blocker. Quy trình 5 không sửa `000001`–`000004`.

Bộ test release chứng minh:

- 20 initiate đồng thời cùng key chỉ tạo một session/reservation.
- 24 reservation 6 byte trên quota 60 byte chỉ có đúng 10 thành công.
- 20 complete đồng thời trả cùng Item/Job, chỉ một commit ledger.
- Text, link, file completed và upload expired cùng đối soát được snapshot với
  tổng ledger.
- Cleanup retry chỉ có một release ledger và một cleanup job theo dedupe key.
- Không có orphan Item/Object/Session/Job hoặc duplicate active job.

## Constraint và index đã review

- `cloud_drives_owner_user_uq`: một Personal Drive cho mỗi owner.
- `UNIQUE (drive_id, idempotency_key)` trên upload session và usage ledger.
- `cloud_jobs_active_dedupe_uq`: một active job cho mỗi dedupe key.
- Check quota không âm và `used + reserved <= quota`.
- Foreign key kép theo `(id, drive_id)` chặn quan hệ cross-drive.
- `cloud_items_timeline_idx`: timeline theo drive/time.
- `cloud_upload_sessions_live_expiry_idx`: scan session hết hạn.
- `cloud_jobs_claim_idx` và `cloud_jobs_stale_lock_idx`: claim/recovery.
- Queue claim sử dụng `FOR UPDATE SKIP LOCKED`, không dựa vào application sleep.

## Lệnh release

```bash
make test-release-process5
```

Script dùng database riêng, chạy:

```text
empty → up → verify → down 1 → up 1 → verify
→ race/integration → reconciliation → vet → build
```

Database test được drop bằng tên đã validate; script không xóa database/volume
ứng dụng. `scripts/reconcile-process5.sql` có thể chạy read-only sau demo và
dừng bằng lỗi nếu snapshot/ledger, orphan hoặc active job dedupe sai.

## Quyết định

- Schema: giữ version 4.
- Finding BLOCKER/MAJOR: không có tại thời điểm Gate.
- Giá trị 5 GB và 100 MB decimal vẫn là cấu hình demo, không mở rộng sản phẩm.
