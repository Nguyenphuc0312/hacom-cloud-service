# Sửa UI bảng báo cáo (màn Trợ lý ảo cá nhân) — 09/07/2026

> Loại: thay đổi thuần FE (render + CSS), **không** đụng contract/BE/shared-types.
> Phạm vi: bảng "Tổng hợp báo cáo các bộ phận" render trong `PersonalMessageBubble`.
> Người sửa: FE • Trạng thái: ĐÃ SỬA, CHỜ THẨM ĐỊNH

Mục đích file: giải thích **từng thay đổi**, **vì sao**, **rủi ro**, **đánh đổi**, **khả năng mở rộng**, **cách test** để bạn rà soát/thẩm định. Không viết theo trí nhớ — mọi dòng dưới đây dẫn chiếu code thật.

---

## 0. Bối cảnh — bảng này render thế nào (để hiểu vì sao lỗi)

Nội dung bảng là **markdown do BE sinh** (`message.content`), FE **không** dựng bảng từ dữ liệu. Luồng render:

```
message.content (markdown GFM)
  → ReactMarkdown
      remarkGfm                     (parse bảng markdown → HTML AST)
      rehypeReportTableCols         (gán class cột col--date/org/mid/wide theo NHÃN header)
      rehypeSanitize                (whitelist, giữ className)
      components={markdownComponents}  (map <table>/<th>/<td>… → JSX Tailwind)
  → CSS: src/features/ai-assistant/styles/ai-animations.css (.prose-chatgpt, .chat-report-table)
```

- Class cột (`col--org` = cột Bộ phận/Công ty) gán theo **nhãn header**, không theo vị trí cột — vì số cột đổi theo phạm vi (cá nhân/phòng ban/công ty). Nguồn: `src/features/ai-assistant/utils/rehypeReportTableCols.ts:17-20`.
- `col--org` map cho các nhãn: **"Công ty", "Phòng ban", "Nhân viên"** (`rehypeReportTableCols.ts:18`).

### 4 lỗi gốc quan sát trên ảnh người dùng gửi

| # | Triệu chứng | Nguyên nhân gốc |
|---|-------------|-----------------|
| A | Cột BỘ PHẬN có nhiều ô **trống trơ** ở các dòng công việc kế tiếp | BE gộp: 1 bộ phận có nhiều dòng công việc → chỉ dòng đầu ghi tên, các dòng sau để trống. Render ra ô trắng → trông như **bảng lỗi/thiếu dữ liệu**. |
| B | Bảng ra **lưới ô vuông** (full border mọi ô) chồng lên thiết kế bo góc + divider ngang | CSS generic `.prose-chatgpt td/th { border: 1px }` (dòng 134-138) **đè** lên style Tailwind của component (component chỉ muốn divider ngang + header gradient + bo góc). Hai lớp style đánh nhau. |
| C | Cột co dãn "không chuẩn", tên phòng dài quấn 5 dòng | `col--org` min-width 120px quá hẹp cho "Phòng Kinh doanh (06/07→12/07/2026)", không có max-width → giãn tuỳ nội dung. |
| D | **Cả message** cuộn ngang lệch, không chỉ bảng | `.prose-chatgpt { overflow-x: auto }` (cũ) khiến toàn khối nội dung cuộn ngang, **trùng** với container bảng vốn đã có `overflow-x-auto` riêng → 2 tầng cuộn. |

---

## 1. Các thay đổi (từng bước, kèm lý do)

### Thay đổi 1 — Ô cột Bộ phận trống → dấu "tiếp tục" thay vì ô trắng (lỗi A)

**File:** `src/features/personal-ai/components/chat/PersonalMessageBubble.tsx:238-262`

```tsx
td: ({ children, className }) => {
  const isOrg = clsx(className).includes("col--org");
  const isEmpty = children == null || children === "" ||
    (Array.isArray(children) && children.every((c) => c == null || c === ""));
  if (isOrg && isEmpty) {
    return (
      <td className={clsx("px-4 py-2.5 align-top", className)}>
        <span className="mt-1 block h-0.5 w-3.5 rounded-full bg-border" aria-hidden />
      </td>
    );
  }
  return (
    <td className={clsx("px-4 py-2.5 align-top text-text-primary",
      isOrg && "font-medium text-text-secondary", className)}>
      <div className="whitespace-pre-wrap break-words">{children}</div>
    </td>
  );
},
```

- **Vì sao trong component, không phải CSS `:empty`?** ReactMarkdown luôn bọc nội dung ô trong `<div>`, nên ô "trống" **không** phải `td:empty` (nó chứa 1 div rỗng). CSS `td:empty` sẽ **không bao giờ khớp** → buộc phải kiểm ở tầng JSX nơi thấy được `children`.
- **`isEmpty`:** bắt cả 3 dạng `children` mà ReactMarkdown trả cho ô rỗng: `undefined`, `""`, và mảng toàn rỗng (`[]` hoặc `[""]`). Lưu ý `[].every()` = `true` → mảng rỗng tính là rỗng (đúng ý).
- **`isOrg && "font-medium text-text-secondary"`:** ô có tên bộ phận (không rỗng) được in **đậm vừa** để tách khỏi nội dung công việc — trước đây tên phòng và nội dung cùng một sắc độ nên khó phân biệt.
- **`aria-hidden`:** dấu gạch chỉ để trang trí (biểu thị "cùng bộ phận với dòng trên"), không phải nội dung → ẩn với screen reader.

### Thay đổi 2 — Tắt full-border generic cho riêng bảng báo cáo (lỗi B)

**File:** `src/features/ai-assistant/styles/ai-animations.css:157-166`

```css
.chat-report-table th,
.chat-report-table td {
  border: 0;              /* huỷ border 1px generic ở .prose-chatgpt td/th (dòng 134-138) */
  vertical-align: top;
  white-space: normal;
  word-break: break-word;
}
```

- Bảng báo cáo (class `chat-report-table`) dùng thiết kế Tailwind của component: **divider ngang** (`divide-y` ở `tbody`), header gradient, bo góc `rounded-2xl`. CSS generic vẽ thêm border quanh **mọi** ô → ra lưới ô vuông đè lên. `border: 0` gỡ đúng phần đó.
- **Chỉ áp cho `.chat-report-table`** → bảng AI thường (không phải báo cáo) vẫn giữ style generic cũ, **không ảnh hưởng**.
- Thêm `margin: 0; font-size: inherit` (dòng 152-155): container `.my-4` của component đã lo khoảng cách; huỷ `margin: 1rem 0` và `font-size: 0.9em` generic để không đá nhau.

### Thay đổi 3 — Độ rộng cột hợp lý hơn (lỗi C)

**File:** `src/features/ai-assistant/styles/ai-animations.css:167-170`

```css
.chat-report-table .col--date { min-width: 96px;  white-space: nowrap; }
.chat-report-table .col--org  { min-width: 132px; max-width: 190px; }   /* +max-width */
.chat-report-table .col--mid  { min-width: 148px; max-width: 240px; }   /* +max-width */
.chat-report-table .col--wide { min-width: 220px; }
```

- `col--org` 120→132px + `max-width: 190px`: đủ cho tên phòng dài xuống ~2 dòng thay vì giãn tuỳ ý. `col--mid` thêm `max-width` để "Đề xuất/Khó khăn" không chiếm chỗ của cột nội dung chính.
- `table-layout: auto` (giữ nguyên) tôn trọng min/max này.

### Thay đổi 4 — Chỉ bảng cuộn ngang, không phải cả message (lỗi D)

**File:** `src/features/ai-assistant/styles/ai-animations.css:149-151`

```css
.prose-chatgpt {
  overflow-wrap: anywhere;   /* trước: overflow-x: auto */
}
```

- Container bảng trong component đã có `overflow-x-auto rounded-2xl border` (`PersonalMessageBubble.tsx:200`) → cuộn ngang **thuộc về bảng**. Bỏ `overflow-x: auto` ở `.prose-chatgpt` để không có 2 tầng cuộn. `overflow-wrap: anywhere` giữ cho văn bản dài (link, từ dài) không tràn khối.

---

## 2. Rủi ro đã cân nhắc

| Rủi ro | Đánh giá | Xử lý |
|--------|----------|-------|
| `bg-border` / `text-text-secondary` không tồn tại → class chết | **Đã kiểm.** `border` là color entry có `DEFAULT` (`tailwind.config.js:103-107`) → `bg-border` hợp lệ. `text.secondary` có (`tailwind.config.js:110`). | Không còn rủi ro. |
| Dấu "tiếp tục" áp cả cột **"Công ty"** (báo cáo cấp công ty cũng là `col--org`) | Ô "Công ty" trống cũng nghĩa "cùng công ty dòng trên" → **đúng ngữ nghĩa**, không phải bug. | Chấp nhận, có chủ đích. |
| `border: 0` gỡ nhầm border ở bảng AI khác | Không: selector giới hạn `.chat-report-table` (chỉ bảng có nhãn header khớp map mới được gắn class này ở `rehypeReportTableCols.ts:66`). | An toàn. |
| Bỏ `overflow-x: auto` ở `.prose-chatgpt` làm nội dung **khác** (code block dài) tràn | Chỉ bảng cần cuộn ngang, và bảng tự cuộn. Code block dùng cơ chế riêng nếu có. | Thấp; cần mắt thấy khi test (mục 4). |
| `isEmpty` bắt nhầm ô có nội dung là khoảng trắng `" "` | Không xảy ra với ô Bộ phận (luôn là tên hoặc rỗng hẳn). Nếu BE gửi `" "` sẽ **không** tính rỗng (chỉ `""` mới rỗng) → hiển thị ô trắng như cũ, không tệ hơn. | Chấp nhận. |

---

## 3. Đánh đổi

- **Ràng buộc nhãn header:** class cột phụ thuộc `COL_CLASS` trong `rehypeReportTableCols.ts`. Nếu **BE đổi nhãn header** (vd "Phòng ban" → "Đơn vị") thì cột đó **mất** width + mất dấu tiếp-tục cho tới khi thêm nhãn vào map. Đây là đánh đổi **có sẵn từ trước**, thay đổi này không làm nặng thêm (chỉ thêm hành vi cho cột đã map).
- **Dấu "tiếp tục" là quy ước thị giác** (gạch ngắn), không phải rowspan gộp ô thật. Ưu điểm: 0 rủi ro, không cần BE đổi, không phá cấu trúc bảng markdown. Nhược điểm: không đẹp bằng gộp ô thật (visual grouping). Muốn gộp ô thật (rowspan) phải đổi ở BE hoặc parse lại markdown ở FE — **không làm ở đây** (over-engineer cho lợi ích nhỏ).
- **Hardcode giá trị px** (min/max-width) thay vì token spacing: hợp lý vì đây là ràng buộc cột đặc thù, không tái dùng chỗ khác.

## 4. Khả năng mở rộng

- **Thêm cột mới từ BE:** chỉ cần thêm nhãn vào 1 trong 4 nhóm `register(...)` ở `rehypeReportTableCols.ts:17-20`. Width tự áp theo class. Không đụng component.
- **Đổi width:** sửa 4 dòng `col--*` trong CSS. Tập trung 1 chỗ.
- **Đổi kiểu dấu "tiếp tục":** sửa 1 dòng `<span>` trong component. Có `isOrg`/`isEmpty` sẵn, dễ thay bằng chữ "—" hay icon nếu muốn.
- Không thêm abstraction/dependency mới.

## 5. Cách test (bạn tự rà)

**Đã chạy:**
- `npx tsc -b` → **No errors found** (typecheck sạch).
- Self-check predicate `isEmpty` với 7 dạng `children` → **ALL PASS** (gồm `undefined`, `""`, `[]`, `[""]`, chuỗi, mảng có nội dung).

**Cần mắt thấy (chưa tự drive được vì cần đăng nhập + báo cáo thật):**
1. Mở màn Trợ lý ảo cá nhân → hỏi tổng hợp báo cáo phòng ban (như ảnh). HMR đã áp sẵn nếu tab đang mở → reload.
2. Kiểm 4 điểm:
   - [ ] Cột BỘ PHẬN: ô trống hiện **gạch ngắn** thay vì trắng trơ; tên phòng **đậm vừa**.
   - [ ] Bảng chỉ có **divider ngang** + bo góc, **không** lưới ô vuông.
   - [ ] Tên phòng dài **không** quấn quá 2 dòng; cột không giãn lệch.
   - [ ] Kéo ngang: **chỉ bảng** cuộn (trong khung bo góc), không phải cả message.
3. Test dark mode (token `bg-border`/`text-text-secondary` có biến thể dark ở `tailwind.config.js:180`, `src/index.css:289`).
4. Test bảng phạm vi **cá nhân** (nhãn "Nhân viên") và **công ty** (nhãn "Công ty") — cùng dùng `col--org`, xác nhận dấu tiếp-tục hợp lý ở cả hai.

## 6. Đồng bộ với các bảng liên quan (QUAN TRỌNG)

Bảng báo cáo được render ở **2 nơi**, không phải 1:

| Màn | Component | Ghi chú |
|-----|-----------|---------|
| **Cá nhân** (tab Cá nhân) | `personal-ai/.../PersonalMessageBubble.tsx` | có `TableExportMenu` (sao chép/tải từng bảng) |
| **Công ty** (tab Công ty) | `ai-assistant/.../AiAnswerContent.tsx` (qua `AiChatPreview`) | không có export menu |

**Trạng thái TRƯỚC khi đồng bộ:** hai màn render bảng **lệch nhau** — Cá nhân có bộ `components` Tailwind (bo góc, divider, gradient), Công ty **chỉ** dựa CSS `.prose-chatgpt` generic (border ô vuông). Nếu chỉ sửa CSS như bước đầu, `border:0` sẽ **gỡ đường kẻ của màn Công ty mà không cho lại gì** → màn Công ty **tệ hơn**.

**Đã đồng bộ:** tách 5 renderer thuần-trình-bày (`thead/tbody/tr/th/td`) ra **1 module chung** `src/features/ai-assistant/components/reportTableComponents.tsx`, cho **cả 2 màn** spread vào. Kết quả:
- Ô Bộ phận trống → dấu gạch **ở cả 2 màn**.
- Tên phòng đậm, divider ngang, header gradient, bo góc, width cột **đồng bộ 2 màn**.
- `<table>` wrapper giữ **riêng** mỗi màn (Cá nhân kèm `TableExportMenu`, Công ty gọn hơn) — vì phần này khác nhau có chủ đích, gộp sẽ sai.

**Nguồn style giờ là 1:** sửa trình bày bảng → sửa `reportTableComponents.tsx` (+ width cột ở `ai-animations.css`), tự áp cả 2 màn. Không còn nhân đôi.

> Còn `TextMessage.tsx` / `MarkdownContent.tsx` / `EventDetailModal.tsx` cũng dùng ReactMarkdown nhưng **KHÔNG** dùng `rehypeReportTableCols` → không phải bảng báo cáo, không đụng tới, không ảnh hưởng.

## 7. File đã đổi (4 file)

| File | Nội dung |
|------|----------|
| `src/features/ai-assistant/components/reportTableComponents.tsx` | **MỚI** — 5 renderer bảng dùng chung (dấu tiếp-tục ô org trống + đậm tên bộ phận + divider/gradient) |
| `src/features/personal-ai/components/chat/PersonalMessageBubble.tsx` | thay 5 renderer inline bằng spread module chung; giữ `table` (TableExportMenu) |
| `src/features/ai-assistant/components/AiAnswerContent.tsx` | spread module chung + thêm `table` wrapper bo góc (màn Công ty trước đây thiếu) |
| `src/features/ai-assistant/styles/ai-animations.css` | bỏ overflow-x message; tắt full-border cho `.chat-report-table`; chỉnh width cột |

Không đổi: `rehypeReportTableCols.ts` (logic gán class cột). Không đụng BE/contract/shared-types.

## 8. Test (cập nhật)

**Đã chạy:**
- `npx tsc -b` → **No errors found**.
- `vitest run rehypeReportTableCols.test.ts` → **2 passed** (logic gán class cột không đổi).
- Self-check predicate `isEmpty` (7 case) → PASS.

**Cần mắt thấy — LƯU Ý test CẢ HAI màn:**
- [ ] Tab **Cá nhân**: 4 điểm ở mục 5.
- [ ] Tab **Công ty**: cùng 4 điểm — đặc biệt xác nhận bảng giờ có bo góc + divider (trước đây là lưới ô vuông), ô Bộ phận trống có dấu gạch.
- [ ] Dark mode cả 2 màn.
- [ ] Bảng phạm vi cá nhân (nhãn "Nhân viên") / công ty (nhãn "Công ty") — cùng `col--org`.
