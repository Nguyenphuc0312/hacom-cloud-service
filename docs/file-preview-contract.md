# Hacom Cloud — File Preview Contract

> Phạm vi: bổ sung khả năng xem/tải file đã `ready` trên giao diện Hacom Cloud.
> Không thay đổi upload, quota, Worker lifecycle, trash hay contract Chat.

## Luồng chuẩn

1. Timeline trả metadata Item, tuyệt đối không trả bucket/object key.
2. Khi người dùng mở file, frontend gọi
   `GET /api/v1/cloud/items/{itemID}/access`.
3. Backend xác thực user demo, ownership, loại Item, trạng thái Item/Object,
   object thật trong MinIO và kích thước.
4. Backend cấp presigned GET URL TTL ngắn.
5. Viewer dùng URL cho phiên xem hiện tại; URL được cache ngắn hơn thời điểm hết
   hạn và được xin lại khi tải xuống hoặc khi URL cũ hết hạn.

## Ranh giới an toàn

- Không nhận object key từ frontend.
- Cross-owner và Item không tồn tại cùng trả `404`.
- Chỉ `file`, `image`, `video`, `audio` ở trạng thái `ready` được cấp URL.
- Không ghi presigned URL, object key, credential hoặc nội dung file vào log.
- JSON chứa URL đặt `Cache-Control: no-store`.
- Lỗi dependency được che thành `INTERNAL_ERROR`; object thiếu/size lệch trả lỗi
  nghiệp vụ ổn định và không cấp URL.

## Khả năng preview

| Nhóm | Hành vi |
|---|---|
| Ảnh | Hiển thị trực tiếp, zoom, chuyển file trong gallery, tải xuống |
| Video | Phát bằng video player của viewer |
| Audio | Phát bằng audio player của viewer |
| Text/code | Đọc nội dung trong viewer |
| PDF | Hiển thị bằng khả năng PDF của trình duyệt |
| File Office/định dạng khác | Hiện thông tin file và cho tải xuống nếu trình duyệt không hỗ trợ |
| Archive/executable | Không render nội dung; chỉ tải xuống |

## Ngoài phạm vi thay đổi này

- Thumbnail/transcode/virus scan phía server.
- Preview Office bằng dịch vụ chuyển đổi.
- Folder, share, trash/restore và quản trị nội dung.
- Auth production; header `X-Demo-User-ID` vẫn là contract local hiện tại.

## Acceptance

- User mở được ảnh, video và text đã upload ngay trong cửa sổ viewer kế thừa từ
  Chat.
- Nút trước/sau duyệt các file preview được trong timeline.
- Download dùng URL mới, không dùng URL hết hạn.
- User khác không lấy được URL.
- Item chưa `ready`, object thiếu hoặc size lệch không được cấp URL.
- Unit, integration, frontend test, lint, typecheck và build đều đạt.
