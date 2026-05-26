# BUILD.md — Lưu ý tránh lỗi build/CI

Ghi lại các lỗi build đã gặp + cách phòng tránh. Đọc trước khi push lên git để CI không fail.

---

## 1. Casing import (Windows vs Linux CI)

**Lỗi:** `TS1261: Already included file name '...truncateFileName.ts' differs from file name '...truncateFilename.ts' only in casing.`

**Nguyên nhân:** Windows filesystem **không phân biệt hoa/thường**, nhưng:
- TypeScript (`tsc -b`) bật `forceConsistentCasingInFileNames` → báo lỗi nếu import sai casing.
- Linux CI / git runner phân biệt hoa/thường → import sẽ fail luôn ở runtime.

**Quy tắc:**
- Tên import **phải khớp tuyệt đối** với tên file thực tế (kể cả hoa/thường).
- Khi tạo file mới hoặc rename, kiểm tra lại tất cả import liên quan.
- Đã gặp với `src/utils/truncateFilename.ts` (đúng) bị import là `truncateFileName` (sai) ở 3 file message.

**Check nhanh trước khi commit:**
```bash
npm run typecheck   # tsc -b, bắt lỗi casing
npm run build       # build production
```

---

## 2. Lệnh trước khi push

Chạy đầy đủ trước khi push lên main/PR:
```bash
npm run build && node scripts/verify-dist-assets.mjs
```
Hoặc dùng full gate:
```bash
npm run ci:readiness
```

---

## 3. Warnings có thể bỏ qua (không phải lỗi)

Các warning sau **không làm fail build**, không cần fix trong PR thường:
- `Export "useAuthStore" of module "src/stores/authStore.ts" was reexported through module "src/stores/index.ts"...` — circular re-export qua barrel `stores/index.ts`. Có thể fix bằng cách import trực tiếp `from "@/stores/authStore"` thay vì `from "@/stores"`.
- `Some chunks are larger than 500 kB after minification` — chunking warning, chỉ là gợi ý.
- `MaintenancePage.tsx is dynamically imported ... but also statically imported` — fix bằng cách bỏ static export ở `pages/errors/index.ts` nếu route dùng lazy.

---

## 4. Quy ước đặt tên file (để tránh lặp lại lỗi casing)

- File utils/hooks/components: **camelCase** cho utils/hooks (`truncateFilename.ts`, `useSendMessage.ts`), **PascalCase** cho component (`MessageItem.tsx`).
- Khi import: copy-paste đường dẫn từ file explorer hoặc dùng auto-import của IDE — **không gõ tay**.
- Nếu rename file, dùng `git mv` (giữ history) và sửa tất cả import bằng search toàn project.
