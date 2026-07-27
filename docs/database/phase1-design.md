# Hacom Cloud Phase 1 — Database Design

## 1. Quy định đã chốt

| Quy định | Thiết kế |
|---|---|
| Mỗi người có 5 GB | `cloud.quotas.quota_bytes = 5,368,709,120` bytes |
| Text, link, ảnh, video và file đều tính quota | Mỗi item có `billable_bytes`; mọi thay đổi ghi vào ledger |
| Tối đa 100 MB mỗi nội dung | Check constraint `1..104,857,600` bytes |
| Vượt 100 MB | API từ chối; người dùng lưu trên Drive ngoài và lưu link |
| Không có lưu tạm ở nghiệp vụ | Item hoàn tất được lưu bền vững; upload session kỹ thuật vẫn có hạn để dọn upload dang dở |
| Xóa có thể restore trong 24 giờ | Item chuyển `trashed`, đặt `purge_after`; worker purge sau thời hạn |
| Nhân viên nghỉ việc | Drive không bị cascade theo Auth; có thể chuyển `suspended/archived` và giữ dữ liệu |
| Tăng quota phải được admin duyệt | Phase sau thêm quota request; Phase 1 chỉ có quota snapshot và audit |
| Tối ưu/dedup phát triển sau | SHA-256 được lưu và index nhưng chưa có unique constraint |
| Chưa kết nối Chat | Chỉ chuẩn bị soft source reference, không có cross-service FK |
| Chưa có Folder | Không có `parent_id`, folder table hoặc folder type |

## 2. Vì sao tách Item và Storage Object

`cloud.items` là nội dung người dùng nhìn thấy trên timeline. `cloud.storage_objects` là object vật lý trong MinIO.

Việc tách này giải quyết:

1. Text/link không cần tạo object giả trong MinIO.
2. Xóa/restore timeline không buộc phải xóa file ngay lập tức.
3. Worker có lifecycle riêng cho upload, hash, scan và cleanup.
4. Sau này có thể thêm dedup, file version, thumbnail và Chat copy mà không đổi bảng Item.
5. Database vẫn không lưu binary.

Không đặt `UNIQUE(checksum_sha256)` trong Phase 1. Hai file chỉ được coi là trùng khi checksum và size khớp, nhưng chính sách dùng chung object chưa được triển khai.

## 3. Lifecycle

### 3.1 Item

```text
pending
→ processing
→ ready
→ trashed
→ worker permanent_delete
→ xóa row

pending/processing → failed
failed → processing (retry)
trashed → ready (restore trước purge_after)
```

Khi đưa vào thùng rác, quota vẫn được tính. Chỉ khi purge vĩnh viễn mới ghi ledger `purge` và giảm `used_bytes`. Cách này ngăn việc dùng thùng rác để vượt quota.

Thứ tự permanent delete:

1. Worker xóa binary/parts trong MinIO.
2. Đánh dấu Storage Object `deleted` và ghi audit.
3. Ghi ledger `purge`, giảm quota trong cùng transaction.
4. Xóa Item; Upload Session và Upload Part phụ thuộc tự cascade.
5. Xóa Storage Object metadata sau thời gian audit kỹ thuật nếu không còn Item tham chiếu.

### 3.2 Storage Object

```text
reserved → uploaded → processing → ready
                                  ├→ quarantined
                                  └→ failed

ready/quarantined/failed → delete_pending → deleted
```

`deleted` chỉ được ghi sau khi worker xác nhận MinIO object không còn tồn tại. Metadata có thể được giữ ngắn hạn để audit rồi cleanup sau.

### 3.3 Upload Session

```text
initiated → uploaded → completing → completed
     ├→ expired
     ├→ cancelled
     └→ failed
```

Một session giữ chỗ đúng bằng `declared_size_bytes`. Complete phải kiểm tra:

- Object tồn tại.
- Kích thước thực tế bằng kích thước khai báo.
- Kích thước không vượt 100 MB.
- Checksum đúng nếu client cung cấp.
- Session chưa hết hạn.

## 4. Quota và tính đồng thời

Snapshot:

```text
used_bytes + reserved_bytes <= quota_bytes
```

### Reserve upload

Thực hiện bằng một câu `UPDATE ... WHERE`, không đọc rồi cập nhật tách rời:

```sql
UPDATE cloud.quotas
SET reserved_bytes = reserved_bytes + $1,
    version = version + 1
WHERE drive_id = $2
  AND used_bytes + reserved_bytes + $1 <= quota_bytes
RETURNING *;
```

Trong cùng transaction:

1. Update quota.
2. Insert ledger `reserve`.
3. Tạo Item, Storage Object, Upload Session.

Nếu không có row trả về, báo `QUOTA_EXCEEDED`.

### Complete upload

Trong một transaction:

1. Khóa Upload Session và Quota.
2. Chuyển `reserved_bytes → used_bytes`.
3. Ghi ledger `commit`.
4. Đổi session thành `completed`.
5. Tạo job xử lý hậu kỳ.

### Expire/cancel

Trong một transaction:

1. Giảm `reserved_bytes`.
2. Ghi ledger `release`.
3. Đổi session sang `expired/cancelled`.
4. Worker xóa object rác nếu client đã upload.

Mọi ledger event có idempotency key duy nhất theo Drive để retry không cộng/trừ hai lần.

## 5. Nội dung tính quota

| Loại | `size_bytes` và `billable_bytes` Phase 1 |
|---|---|
| Text | Số byte UTF-8 của nội dung |
| Link | Số byte UTF-8 của URL + title/note được lưu |
| File/ảnh/video/audio | Kích thước object thực tế sau verify |

API chịu trách nhiệm tính byte bằng dữ liệu UTF-8 chuẩn hóa. Database bảo đảm giá trị dương và không quá 100 MB.

## 6. Worker queue

Phase 1 dùng `cloud.jobs`; worker claim bằng:

```sql
SELECT id
FROM cloud.jobs
WHERE status IN ('pending', 'failed')
  AND run_after <= NOW()
ORDER BY priority, run_after, created_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

Sau khi claim, worker cập nhật `processing`, `locked_by`, `locked_at`, tăng `attempts`. Khi đủ `max_attempts`, chuyển sang `dead`.

Kafka chưa cần cho demo. Khi chuyển sang Kafka, nên thêm Outbox migration và giữ `cloud.jobs` cho các tác vụ nội bộ cần retry.

## 7. Quyền truy cập và riêng tư

- Database không tự cho admin đọc nội dung.
- API luôn lọc `drive.owner_user_id = JWT sub`.
- Admin operation cần permission riêng và phải ghi audit.
- Audit không lưu text/file content, access token, presigned URL hoặc secret.
- Phase 1 chưa bật PostgreSQL RLS vì service dùng một database role; authorization nằm ở Cloud Service.

## 8. Những bảng để Phase sau

Không tạo trong migration Phase 1:

```text
cloud.file_versions
cloud.object_variants
cloud.shares
cloud.share_recipients
cloud.quota_change_requests
cloud.outbox_events
cloud.ai_documents
cloud.ai_chunks
cloud.ai_embeddings
```

Các bảng này được thêm bằng migration mới, không sửa migration Phase 1 sau khi đã merge.

## 9. Giá trị cần mentor xác nhận

Schema hiện chọn giá trị rõ ràng để nhóm có thể code, nhưng cần xác nhận trước khi merge:

1. `5 GB` đang được hiểu là `5 GiB = 5,368,709,120 bytes`, không phải 5,000,000,000 bytes.
2. `100 MB` đang được hiểu là `100 MiB = 104,857,600 bytes`, không phải 100,000,000 bytes.
3. Item trong thùng rác vẫn tính quota và được purge sau 24 giờ.
4. Multipart đã có schema nhưng API demo có thể chỉ làm single-part.
5. `cloud.storage_objects` là bảng metadata riêng, không dùng lại bảng file của Chat.
