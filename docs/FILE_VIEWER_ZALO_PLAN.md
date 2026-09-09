# Xem file kiểu Zalo — kế hoạch & tiến độ

> **Ngày bắt đầu:** 08-08-26
> **Phạm vi:** `chat-web-client` (web) + `chat-window-desktop` (Electron)
> **Mục tiêu:** card file & trình xem file (Word/Excel/PDF) hành xử như Zalo 2026.

## 0. Sự thật nền tảng (quyết định toàn bộ thiết kế)

Zalo PC là app **Electron**. Bấm vào file .docx → `shell.openPath()` → Windows mở
bằng **Word thật** trên máy. Nút 📁 = `shell.showItemInFolder()`. Nó biết chắc
"Đã có trên máy" vì `fs.existsSync()` đường dẫn thật.

**Web KHÔNG làm được nhóm đó** — trình duyệt sandbox: không có API mở Word, không
đọc được thư mục Downloads. Đây là giới hạn cứng của nền tảng, không lách được.

Vì `chat-window-desktop` là Electron **bọc chính web client này**, cùng một React
code chạy ở cả hai nơi. Nên: viết một lần, dò `window.chatDesktop?.files` lúc
chạy, có thì dùng đường Zalo-thật, không có thì fallback web.

| | Web (trình duyệt) | Desktop (Electron) |
|---|---|---|
| Bấm card | Mở preview trong app | **Mở bằng Word/Excel thật** |
| Trạng thái tải | Chỉ “đã yêu cầu tải”/browser handoff; không biết file local | `fs.existsSync()` — chính xác |
| Nút 📁 mở thư mục | ❌ không thể | ✅ `showItemInFolder` |

---

## Phase 1 — Nền: trạng thái file cục bộ

- [x] `chat-web-client/src/utils/downloadedFiles.ts` — trạng thái browser handoff
      cục bộ (localStorage, key theo `attachmentId`, trần 500 bản ghi, có pub/sub);
      không phải bằng chứng file còn tồn tại trên máy.
- [x] `chat-window-desktop/src/main.js` — 4 IPC: `file:save` / `file:open` /
      `file:reveal` / `file:exists`, kèm `resolveAttachmentPath` chống path
      traversal (renderer nạp web từ internet → đường dẫn là dữ liệu không tin cậy).
- [x] `chat-window-desktop/src/preload.js` — expose `chatDesktop.files`.
- [ ] `chat-web-client/src/utils/desktopBridge.ts` — typed wrapper + `isDesktop()`.
- [ ] `chat-web-client/src/hooks/useLocalFile.ts` — hook hợp nhất 2 nền tảng:
      trả `{ status, openLocal, reveal, saveLocal }`.

## 0b. Quan sát Zalo **Web** thật (chat.zalo.me, ảnh user gửi 08-08-26)

Xác nhận & bổ sung cho phần trên:

**Card file:**
- Bình thường: `35.46 KB · 🕐 Tải về để xem lâu dài`
- **Hover: đổi hẳn thành `🕐 Nhấn để xem trước`** (dòng size biến mất) → xác nhận
  click card = mở preview.
- Web Zalo **không có** "Đã có trên máy", **không có** nút 📁 → đúng như phân tích:
  đó là đặc quyền desktop. Web chỉ được nói “đã yêu cầu tải”/browser handoff, không
  được suy ra file còn trên máy từ localStorage.
- Nút tải: icon ⬇ trong **khung viền vuông bo góc**, tách riêng bên phải.

**Trình xem (khác thiết kế hiện tại của ta — modal nổi giữa nền mờ):**
- **Full-screen tối giản**, nền trắng/xám, không backdrop mờ.
- **Thanh công cụ nằm DƯỚI đáy nội dung**: trái = icon W/X + `PAGE 1 OF 6`
  (Word) hoặc tab sheet (Excel); phải = `100%` + nút layout + fullscreen.
- **Footer riêng dưới cùng**: avatar + tên người gửi + `Hôm qua lúc 14:06 - 35 KB`;
  bên phải là ⬇ và ✕.
- Excel giữ **header cột A/B/C + số dòng**, tab sheet dưới đáy, có ô công thức.

## Phase 2 — Card file trong tin nhắn (2 ảnh Zalo user gửi)

- [x] `FileTypeIcon.tsx` — icon Office thật: W #2B579A, X #217346, P #D24726,
      PDF #D32F2F. Nhận thêm `fileName` vì `getFileIconType` gộp `.txt`→document
      và `.csv`→spreadsheet: không có tên file thì `.txt` sẽ hiện glyph "W" sai.
- [x] `FileMessageCard.tsx`:
  - [x] **Click cả card = mở** (bỏ nút mắt 👁 — user đã chốt).
  - [x] Dòng trạng thái web: `35.46 KB · 🕐 Tải về để xem lâu dài` ↔ `Đã yêu cầu tải`;
        không gọi là file có trên máy. Hover đổi thành `Nhấn để xem trước` như Zalo Web.
  - [x] Nút 📁 mở thư mục chứa — **chỉ hiện trên desktop** + đã tải.
  - [x] Bấm tải → `markFileDownloaded()`; desktop lưu thêm bản vào đĩa để lần sau
        mở thẳng bằng Word/Excel.
  - [x] Giữ nguyên nhánh ảnh/video (đã tốt, không đụng).
- [x] i18n `vi` + `en` cho 6 key mới (key thật cả 2 ngôn ngữ, không dựa `defaultValue`).

## Phase 3 — Trình xem file (modal)

Đã có sẵn, **không làm lại**: PDF.js (zoom + điều hướng trang), Excel tab sheet,
Word docx-preview, Text/CSV/Archive.

- [x] `WordPreview.tsx` — zoom 50–250% + thanh công cụ dưới đáy (icon W + số trang).
- [x] `ExcelPreview.tsx` — zoom; tab sheet chuyển xuống thanh dưới cạnh mức zoom.
- [x] `PdfJsViewer.tsx` — nhớ trang đang đọc, mở lại về đúng trang.
      Khoá theo `tên+cỡ file` vì URL đính kèm là URL ký, đổi mỗi lần resolve.
- [x] `FilePreviewModal.tsx` — nút tải cũng `markFileDownloaded()` (cùng khoá với thẻ).

## Phase 4 — Kiểm chứng (đã chạy 08-08-26)

- [x] `downloadedFiles.test.ts` — 6 test: lưu/đọc, id rỗng, dữ liệu hỏng, quota
      đầy, cắt trần 500, pub/sub.
- [x] `pdfReadingPosition.test.ts` — 6 test: khoá theo tên+cỡ, bỏ trang 1/file
      ngắn, file bị thay ngắn hơn → không nhảy quá số trang.
- [x] `scripts/test-attachment-path.js` (desktop) — 19 test chống path traversal.
- [x] typecheck sạch · lint sạch · **327 test / 49 file đều xanh** · build xanh.
- [x] `madge --circular` = **9 vòng** — đúng bằng baseline cũ, không thêm vòng nào.
- [x] `i18n:check`: 6 key mới có đủ vi+en (lỗi `chat:file.uploading` là có sẵn
      từ trước ở `ImageMessage.tsx:487`, không thuộc phần này).
- [x] Dev server `localhost:5100` trả 200 và transform được toàn bộ module mới.
- [ ] Commit theo mục 13b CLAUDE.md.

---

## Ghi chú giới hạn (phải nói với user, không giấu)

Trên **web**, không được hiển thị hay suy ra “Đã có trên máy”. Browser chỉ biết
một yêu cầu tải/handoff đã được khởi tạo; người dùng có thể hủy, đổi nơi lưu, hoặc
trình duyệt có thể từ chối mà web không quan sát được. Chỉ bản **desktop** mới
phản ánh đúng file trên đĩa và mới được hiện “Đã có trên máy” hoặc nút 📁.


## Phase 5 — Build-time rollout & telemetry guard (P5)

- [x] Cờ Vite build-time VITE_FILE_VIEWER_ENABLED, mặc định false; chỉ literal
      true mới bật thao tác viewer nội bộ tại card file chat.
- [x] Không gate upload/download, thumbnail ảnh/video, hoặc đường native
      desktop save/open/reveal.
- [x] VITE_FILE_LIFECYCLE_TELEMETRY_ENABLED phát browser CustomEvent allowlist
      cục bộ; không có tên file, path, URL ký, token, ID, hay raw error.
- [x] Docker và workflow staging/production truyền hai build args, whitelist
      true/false, và default fail-closed.
- [ ] Browser staging runtime: NOT_RUN.
- [ ] Browser E2E: NOT_RUN.
- [ ] Windows/Electron chọn thư mục, Office mở file, reveal folder: NOT_RUN.

Runbook chi tiết: docs/file-viewer-p5-rollout.md.
