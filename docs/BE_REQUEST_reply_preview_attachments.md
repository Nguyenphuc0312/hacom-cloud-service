# Yêu cầu Backend — Reply preview hiển thị ảnh/file đầy đủ (kiểu Zalo)

> Trạng thái: **FE đã làm xong, đang chờ BE bổ sung field.** Khi BE deploy xong là chạy luôn, FE không cần sửa thêm.
>
> Service liên quan: `chat-api-service` (xem `WEBBE.md`).
> Người yêu cầu: FE web client (`chat-web-client`).

---

## 1. Vấn đề

Khi user **trả lời (reply)** một tin nhắn dạng **ảnh / video / file**, ô reply preview (khung nhỏ phía trên bubble) chỉ hiện **icon xám + chữ "Hình ảnh"**, không hiện thumbnail thật như Zalo/Telegram.

Nguyên nhân: response trả về của message **không kèm `attachments` trong `replyToMessage`** (hoặc kèm nhưng thiếu `id`). FE cần `attachments[].id` để gọi tiếp API lấy signed thumbnail URL. Không có `id` → không lấy được ảnh → fallback ra icon xám.

---

## 2. FE đã làm gì (không cần BE quan tâm chi tiết, chỉ để hiểu context)

- `ReplyPreview.tsx` đã được sửa: nếu `replyToMessage.type` là `IMAGE`/`VIDEO` và có `attachments[0].id`, FE tự gọi:
  ```
  POST /files/batch-thumbnail-urls
  body: { conversationId, fileIds: ["<attachments[0].id>"] }
  ```
  (endpoint này **đã có sẵn**, không cần làm mới) → lấy signed URL → render thumbnail.
- File `.md` này chỉ yêu cầu BE **gắn đủ dữ liệu `attachments` vào `replyToMessage`**.

---

## 3. Việc cần làm ở BE (DUY NHẤT)

Bổ sung field **`attachments`** vào object **`replyToMessage`** (kiểu `MessageSummary`) ở **mọi response trả về message có reply**, gồm:

| Nơi trả về | Endpoint / Event |
|---|---|
| Danh sách message | `GET /conversations/:id/messages` |
| 1 message | `GET /messages/:id` (getMessageById) |
| Tìm kiếm | `searchMessages` |
| Ack khi gửi | response của `sendMessage` |
| Realtime | WS event `message:new` / `message:received` (payload có `replyToMessage`) |

> Hiện `MessageSummary` trong `@hacom/chat-shared-types` **đã khai báo** `attachments?: Attachment[]` (xem `entities/Message.ts`). BE chỉ cần **populate dữ liệu**, không phải đổi type.

### Field tối thiểu cho mỗi `attachments[]` trong `replyToMessage`

| Field | Bắt buộc | Ghi chú |
|---|---|---|
| `id` | ✅ **Bắt buộc** | FE dùng để gọi `batch-thumbnail-urls`. Thiếu cái này là hỏng. |
| `type` | ✅ | `image` / `video` / `file` … |
| `fileName` | ✅ với FILE | Hiển thị tên file + đoán đuôi (PDF/DOCX…). |
| `mimeType` | nên có | Đoán badge đuôi file khi thiếu `fileName`. |
| `thumbnailUrl` | tùy chọn | Nếu là URL public sẵn, FE dùng làm fallback (không bắt buộc vì FE đã có cơ chế signed URL). |
| `width`, `height` | tùy chọn | Cho tỉ lệ ảnh đẹp hơn (không bắt buộc cho preview nhỏ). |

> Không cần trả `url`/`downloadUrl` (signed) trong reply preview — FE tự mint qua `batch-thumbnail-urls`. Chỉ cần `id` là đủ cho ảnh/video.

---

## 4. Ví dụ JSON mong muốn

### Reply tới một tin nhắn ẢNH
```jsonc
{
  "id": "msg_123",
  "type": "text",
  "content": "đẹp đấy",
  "replyToMessage": {
    "id": "msg_100",
    "senderId": "u_55",
    "senderName": "Nguyễn Văn A",
    "type": "image",
    "content": "",            // caption nếu có
    "isDeleted": false,
    "createdAt": "2026-06-17T03:12:00.000Z",
    "attachments": [
      {
        "id": "file_abc",     // ⬅️ BẮT BUỘC
        "type": "image",
        "fileName": "anh.jpg",
        "mimeType": "image/jpeg",
        "width": 1280,
        "height": 720
      }
    ]
  }
}
```

### Reply tới một tin nhắn FILE
```jsonc
{
  "replyToMessage": {
    "id": "msg_101",
    "senderId": "u_55",
    "senderName": "Nguyễn Văn A",
    "type": "file",
    "content": "",
    "isDeleted": false,
    "createdAt": "2026-06-17T03:12:00.000Z",
    "attachments": [
      {
        "id": "file_xyz",
        "type": "file",
        "fileName": "BaoCao_Q2.pdf",   // ⬅️ để FE hiện badge "PDF" + tên file
        "mimeType": "application/pdf",
        "fileSize": 234123
      }
    ]
  }
}
```

---

## 5. Tiêu chí nghiệm thu (Definition of Done)

- [ ] `GET /conversations/:id/messages` trả `replyToMessage.attachments[]` có `id` cho mọi message dạng reply tới ảnh/video/file.
- [ ] Tương tự cho `getMessageById`, `searchMessages`, ack `sendMessage`, và WS event message mới.
- [ ] Với reply tới ảnh: FE gọi `batch-thumbnail-urls` thành công và render thumbnail (không còn icon xám).
- [ ] Với reply tới file: hiện badge đuôi file + tên file (`fileName` có trong payload).
- [ ] Tin nhắn đã thu hồi/xóa (`isDeleted` / `lifecycleStatus`) **không** cần trả attachments.

---

## 6. Lưu ý

- Endpoint signed thumbnail `POST /files/batch-thumbnail-urls` **đã tồn tại và đang chạy** cho timeline — reply preview dùng **chung cache**, không tạo tải thêm đáng kể (mỗi `fileId` chỉ mint 1 lần/TTL).
- Không cần thêm endpoint mới. Chỉ là **populate thêm field** trong query/serializer dựng `replyToMessage`.
