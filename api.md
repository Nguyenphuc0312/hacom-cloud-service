# API — Kho lưu trữ: Link dùng chung (Shared Links)

> Tài liệu hợp đồng API cho mục **Link** trong panel "Kho lưu trữ" (Shared Resources)
> của `components/info/GroupInfo` → `shared-resources/SharedResourcesPreview` +
> `SharedContentModal`.
>
> Trạng thái: **ĐÃ TRIỂN KHAI** ở backend `chat-api-service`
> (`src/services/conversationResources.service.ts`). File này mô tả hợp đồng để
> FE↔BE đồng bộ và để kiểm thử.

---

## 1. Vấn đề trước đây

Tab **Link** luôn trống vì backend chỉ truy vấn message có `message_type: 'link'`:

```ts
ChatMessage.find({ conversation_id, message_type: 'link' })
```

Trong khi đó người dùng thường **dán URL vào tin nhắn văn bản thường**
(`message_type: 'text'`, content là object `{ text, plain_text, preview_text, ... }`).
Những message này không bao giờ được tính → `links.total = 0` → tab Link trống.
Kèm theo đó, FE còn bị lỗi tự nhảy về tab "Ảnh/Video" khi bấm vào tab rỗng
(đã sửa ở `SharedResourcesPreview.tsx`).

## 2. Quy tắc nhận diện Link (mới)

Một message thuộc mục **Link** khi:

1. `message_type === 'link'` (tin nhắn link có preview), **HOẶC**
2. `message_type === 'text'` và **content có chứa** URL `http(s)://` ở bất kỳ vị trí nào
   (đầu/giữa/cuối câu), trong một trong các field: `content.text`,
   `content.plain_text`, hoặc `content` (dạng string legacy).

Chỉ tính message `status: 'active'` (bỏ qua recalled / deleted_admin).

URL được trích xuất bằng regex: `/(https?:\/\/[^\s<>"')\]]+)/i` — lấy URL **đầu tiên**
tìm thấy trong message (mỗi message → tối đa 1 mục Link, khớp với `key={messageId}` ở FE).

---

## 3. Endpoints

### 3.1 `GET /conversations/:id/sidebar-summary`
Trả tóm tắt cho panel. Phần `links`:

```jsonc
{
  "links": {
    "total": 12,                 // countDocuments theo bộ lọc Link mới
    "preview": [ /* LinkItem[] */ ] // tối đa 5 mục mới nhất (message_seq DESC)
  }
}
```

### 3.2 `GET /conversations/:id/links?page=&limit=`
Phân trang đầy đủ danh sách link.

| Query | Default | Max | Ghi chú |
|-------|---------|-----|---------|
| `page` | 1 | — | 1-based |
| `limit` | 20 | 50 | clamp |

Response:

```jsonc
{
  "data": [ /* LinkItem[] */ ],
  "pagination": { "page": 1, "limit": 20, "total": 12, "hasNext": false }
}
```

### 3.3 `LinkItem`

```ts
interface LinkItem {
  messageId: string;   // _id của ChatMessage
  url: string;         // URL trích xuất
  domain: string;      // hostname (new URL(url).hostname), fallback = url
  senderId: string;
  senderName: string;  // sender_snapshot.display_name
  createdAt: string;   // ISO
}
```

> FE map type này tại `services/api.ts` → `ConversationResourcesLinkItem` và render ở
> `DrawerLinkRow` / `ModalLinkRow`.

---

## 4. Lưu ý vận hành

- **Hiệu năng:** nhánh regex `https?://` quét trên `content.text` / `content.plain_text`
  không có index riêng — giống pattern đã dùng cho media/file. Nếu cần tối ưu cho hội
  thoại rất lớn, cân nhắc:
  - Khi gửi tin, set `message_type = 'link'` nếu nội dung là URL thuần, hoặc lưu cờ
    `has_link`/`links[]` đã trích xuất sẵn vào document để truy vấn bằng index.
- **Đa URL trong 1 message:** hiện chỉ lấy URL đầu tiên. Nếu sau này cần liệt kê tất cả,
  đổi `LinkItem.messageId` thành key tổng hợp (`${messageId}:${index}`) ở cả BE lẫn FE.
- `total` (đếm theo message) có thể lệch nhẹ so với số URL thực nếu một message khớp
  filter nhưng extractor trả `null` — chấp nhận được, cả hai đều dò `https?://`.

---

## 5. Trạng thái triển khai

| Hạng mục | File | Trạng thái |
|----------|------|-----------|
| Mở rộng bộ lọc Link (text + link, status active) | `chat-api-service/src/services/conversationResources.service.ts` (`buildLinkFilter`) | ✅ |
| Trích xuất URL ở mọi vị trí trong text | cùng file (`URL_REGEX`, `extractUrlFromContent`) | ✅ |
| Sửa FE tự nhảy về tab Ảnh/Video | `src/components/info/shared-resources/SharedResourcesPreview.tsx` | ✅ |
| Luôn hiện 3 tab Ảnh/Video · File · Link | cùng file | ✅ |
| Phát video trong Kho lưu trữ | `shared-resources/VideoPlayerModal.tsx` + Drawer/Modal media thumb | ✅ |
