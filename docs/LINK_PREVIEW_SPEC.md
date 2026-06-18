# LINK_PREVIEW_SPEC.md — Yêu cầu API Link Preview (OpenGraph unfurl)

> Tài liệu yêu cầu cho backend (`chat-api-service`). Mục tiêu: khi user gửi tin nhắn có chứa URL, FE hiển thị **rich preview** (ảnh, tiêu đề, mô tả, tên site) giống Telegram/Zalo, thay vì chỉ favicon + tên miền như hiện tại.

---

## 1. Hiện trạng (vì sao "gửi link chưa được")

- Gửi link **vẫn hoạt động**: tin nhắn gửi đi, link clickable.
- Nhưng **preview không có nội dung**: FE chỉ render favicon + hostname.
- Nguyên nhân kỹ thuật ở FE:
  - `src/components/message/LinkPreviewCard.tsx` — đã dựng sẵn UI nhận `meta: LinkPreviewMeta` (`title`, `description`, `imageUrl`, `siteName`), **nhưng không ai truyền `meta` vào**.
  - `src/components/message/linkPreviewUtils.ts` — `buildLinkMeta(url)` chỉ trả về `hostname` (fallback).
  - `src/components/chat/message-layout/MessageBodyRenderer.tsx` (dòng ~589) — gọi `<LinkPreviewCard url={firstUrl} isOwn={isOwn} />` **không có `meta`**, và không fetch ở đâu cả.
  - **Không tồn tại endpoint** nào để lấy OG metadata của URL.
- ⇒ **Thiếu đúng 1 API backend: unfurl URL → OG metadata.** FE đã sẵn sàng render khi có dữ liệu.

---

## 2. API cần backend cung cấp

### 2.1 Endpoint chính — Unfurl 1 URL 

```
GET /api/v1/link-preview?url={encodedUrl}
```

- **Auth**: Bearer (đi qua `apiClient`, baseURL `/api/v1`).
- **Query param**: `url` — URL đầy đủ (đã `encodeURIComponent`), chỉ chấp nhận `http`/`https`.
- **Hành vi backend**: server-side fetch trang đích, parse thẻ OpenGraph / Twitter Card / `<title>` / `<meta description>` → trả metadata đã chuẩn hóa.

#### Response (envelope chuẩn `ApiResponse<T>` của hệ thống)

```jsonc
{
  "success": true,
  "data": {
    "url": "https://example.com/bai-viet",   // URL đã resolve (sau redirect)
    "hostname": "example.com",                 // bỏ "www."
    "siteName": "Example",                     // og:site_name (optional)
    "title": "Tiêu đề bài viết",               // og:title | <title> (optional)
    "description": "Mô tả ngắn...",            // og:description | meta description (optional)
    "imageUrl": "https://example.com/og.jpg",  // og:image (absolute URL, optional)
    "faviconUrl": "https://example.com/favicon.ico", // optional
    "mediaType": "website",                    // og:type: website|article|video... (optional)
    "fetchedAt": "2026-06-18T03:00:00.000Z"
  }
}
```

> `data` khớp 1-1 với interface `LinkPreviewMeta` ở FE (xem mục 4). Các field optional thiếu thì FE tự fallback.

#### Trường hợp không lấy được metadata

Trả `success: true` với `data` tối thiểu (chỉ `url` + `hostname`) để FE vẫn render card cơ bản — **không trả 4xx/5xx** cho việc "trang không có OG":

```jsonc
{ "success": true, "data": { "url": "...", "hostname": "..." } }
```

Chỉ trả lỗi khi URL không hợp lệ:
```jsonc
{ "success": false, "error": { "code": "INVALID_URL", "message": "URL không hợp lệ" } }
```

### 2.2 (Tùy chọn) Batch unfurl

Để tối ưu khi load timeline có nhiều link:

```
POST /api/v1/link-preview/batch
Body: { "urls": ["https://a.com", "https://b.com"] }  // tối đa ~10 URL
Response: { "success": true, "data": { "https://a.com": { ...meta }, ... } }
```

---

## 3. Yêu cầu phi chức năng (bắt buộc đọc)

| Hạng mục | Yêu cầu |
|---|---|
| **Cache** | Backend cache metadata theo URL (gợi ý TTL 1–24h). Tránh fetch lại mỗi lần render. |
| **SSRF / bảo mật** | Chặn fetch tới IP nội bộ/private (`127.0.0.0/8`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, metadata cloud `169.254.169.254`). Chỉ cho `http/https`. |
| **Timeout & size** | Timeout fetch ngắn (~5s); giới hạn body tải về (vd ≤ 2MB, chỉ đọc phần `<head>`); chỉ parse `Content-Type: text/html`. |
| **Redirect** | Follow tối đa ~5 redirect; field `url` trả về là URL cuối. |
| **Ảnh** | `imageUrl` phải là URL tuyệt đối (resolve theo base của trang). Cân nhắc proxy ảnh để tránh mixed-content/hotlink. |
| **Rate limit** | Giới hạn theo user để tránh lạm dụng SSR fetch. |
| **HTML entities** | Decode entity trong title/description (vd `&amp;` → `&`). |

---

## 4. Phần FE sẽ làm sau khi có API (để backend hình dung hợp đồng)

> Phần này **không yêu cầu backend làm** — chỉ mô tả cách FE tiêu thụ, để khớp shape dữ liệu.

1. **`services/api.ts`** — thêm client:
   ```ts
   export const linkPreviewApi = {
     get: async (url: string) => {
       const res = await apiClient.get<ApiResponse<LinkPreviewMeta>>(
         `/link-preview?url=${encodeURIComponent(url)}`,
       );
       return res.data;
     },
   };
   ```
2. **`linkPreviewUtils.ts`** — `LinkPreviewMeta` đã có sẵn (`url`, `hostname`, `title?`, `description?`, `imageUrl?`, `siteName?`); bổ sung `faviconUrl?`, `mediaType?` cho khớp response.
3. **Hook mới** `useLinkPreview(url)** — fetch + cache phía FE (RTK Query hoặc react state), trả `{ meta, isLoading }`.
4. **`MessageBodyRenderer.tsx`** — sửa nhánh `TEXT` (dòng ~589):
   - Truyền `meta` + `isLoading` từ hook vào `<LinkPreviewCard url={firstUrl} meta={meta} isLoading={isLoading} isOwn={isOwn} />`.
   - **Sửa bug phụ**: với tin `rich_text`, hiện `firstUrl` bị ép `null` ⇒ không hiện preview. Cần trích URL đầu tiên từ cả nội dung rich text (parse text/`<a href>`) để vẫn render card.

---

## 5. Tiêu chí nghiệm thu (Definition of Done)

- [ ] `GET /api/v1/link-preview?url=...` trả OG metadata đúng shape mục 2.1 cho trang công khai có OG (vd báo, youtube, github).
- [ ] Trang không có OG vẫn trả `success: true` với `url` + `hostname`.
- [ ] URL nội bộ/private IP bị chặn (SSRF), timeout & giới hạn size hoạt động.
- [ ] Có cache TTL, request lần 2 cùng URL không fetch lại trang đích.
- [ ] (Nếu làm batch) `POST /link-preview/batch` trả map URL → meta.
- [ ] FE: gửi 1 link → hiện card có ảnh + tiêu đề + mô tả + tên site.

---

## 6. Tham chiếu file FE liên quan

| Việc | File |
|---|---|
| UI card preview (đã sẵn sàng nhận `meta`) | `src/components/message/LinkPreviewCard.tsx` |
| Type `LinkPreviewMeta` + `buildLinkMeta` | `src/components/message/linkPreviewUtils.ts` |
| Nơi render preview trong message | `src/components/chat/message-layout/MessageBodyRenderer.tsx` (`extractFirstUrl`, nhánh `TEXT`) |
| Khai báo endpoint REST | `src/services/api.ts` |
| Envelope `ApiResponse<T>` / `extractApiError` | `src/lib/apiContract.ts` |

> Ghi chú: đã có endpoint liệt kê link trong hội thoại (`GET /conversations/:id/links`) trả `ConversationResourcesLinkItem` (chỉ `url` + `domain`). API link-preview ở đây là **bổ sung độc lập** để unfurl metadata, không thay thế endpoint đó.
