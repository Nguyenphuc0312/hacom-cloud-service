# Thẩm Định: Bảng Lịch Trong Chat + Nút Xem Chi Tiết / Sửa / Xóa / Phản Hồi

Ngày: 09/07/2026
Phạm vi: FE chat Trợ lý cá nhân (`chat-web-client`) render bảng lịch khi BE trả `calendar_events` ở SSE `done`, và mở chi tiết sự kiện (xem / sửa / xóa / phản hồi mời họp).
Nguồn spec: `FE__calendar-chat-table-detail-button__spec__09-07-26.md`.

Tài liệu này để bạn **rà soát và thẩm định** — mỗi quyết định có: lý do, rủi ro đã cân nhắc, đánh đổi, khả năng mở rộng, cách kiểm chứng.

---

## 0. Bản đồ thay đổi (đọc trước)

| File | Loại | Việc |
|---|---|---|
| `features/personal-ai/types/index.ts` | sửa | Thêm type `CalendarEventRow` / `CalendarEventAction`; gắn `calendar_events` (response) + `calendarEvents` (message). |
| `features/personal-ai/api/personalAiApi.ts` | sửa | `normalizeCalendarEvents()` + đọc `calendar_events` ở cả 2 nhánh parse `done`. |
| `features/personal-ai/hooks/usePersonalChat.ts` | sửa (+9 dòng) | Patch `calendarEvents` vào message sau `finalizeMessage`. |
| `features/personal-ai/components/chat/CalendarEventTable.tsx` | **mới** | Render bảng 5 cột + nút; mở `EventDetailModal`; nối Sửa/Xóa/Phản hồi. |
| `features/personal-ai/components/chat/PersonalMessageBubble.tsx` | sửa | Render `CalendarEventTable` khi message có `calendarEvents`. |
| `features/personal-ai/api/personalAiApi.test.ts` | sửa | +3 test cho parse `calendar_events`. |

Không đụng: `EventDetailModal`, `useCalendarEventMutations`, `calendarStore`, `CalendarPage` — **tái dùng nguyên trạng**.

---

## 1. Luồng dữ liệu end-to-end

```
BE stream SSE ──event: done──▶ { answer, calendar_events:[...] }
      │
      ▼  streamPersonalChat (personalAiApi.ts)
normalizeCalendarEvents()  ── loại dòng thiếu event_id, bỏ detail_action sai type
      │  response.calendar_events
      ▼  usePersonalChat.sendMessage
finalizeMessage(content, sources)         ← nội dung markdown vẫn lưu vào content
patchMessage({ calendarEvents })          ← chỉ patch khi mảng có phần tử
      │  message.calendarEvents
      ▼  PersonalMessageBubble
có calendarEvents? ──▶ <CalendarEventTable>   (thay markdown)
không            ──▶ ReactMarkdown (đường cũ, không đổi)
      │
      ▼  bấm "Xem chi tiết"
hrCalendarApi.getEvent(event_id) ──▶ HRCalendarEvent ──▶ EventDetailModal
                                 └─ lỗi ▶ toast, KHÔNG vỡ UI
```

**Nguyên tắc xuyên suốt:** phần render (bảng) là mới; phần nghiệp vụ lịch (mở/sửa/xóa/phản hồi) **không viết mới** — đi qua đúng hạ tầng `/calendar` đang chạy.

---

## 2. Từng quyết định — lý do, rủi ro, đánh đổi

### 2.1. Render bằng component riêng, KHÔNG parse lại markdown

**Viết thế nào:** khi `message.calendarEvents` có phần tử → render `CalendarEventTable` từ **mảng có cấu trúc** BE trả; bỏ qua bảng markdown.

**Tại sao:** spec §60 "render bằng component/table riêng thay vì markdown thuần nếu có thể" và §116 "có thể render table từ `calendar_events` khi field này tồn tại". Mảng có cấu trúc (day/time/title/…) đáng tin hơn parse ngược text markdown.

**Rủi ro đã cân nhắc:**
- *BE trả markdown lệch với `calendar_events`?* → Ta ưu tiên mảng, markdown chỉ là fallback khi mảng rỗng. Nếu BE chỉ trả markdown (không có `calendar_events`) → rơi về đường cũ, vẫn hiển thị đúng. **Không có trạng thái vỡ.**
- *Mảng rỗng / thiếu field?* → `normalizeCalendarEvents` trả `undefined` khi rỗng; bubble render text/markdown thường (đúng Empty State spec §125).

**Đánh đổi:** khi có `calendar_events`, ta KHÔNG render bảng markdown gốc → **mất menu "..." xuất Excel** (TableExportMenu) mà bảng báo cáo thường có. Chấp nhận: bảng lịch không phải bảng báo cáo, spec không yêu cầu xuất Excel.

### 2.2. `normalizeCalendarEvents` — chuẩn hóa phòng thủ

**Viết thế nào:** map từng phần tử; **bắt buộc** `event_id` (thiếu → loại dòng); `detail_action` chỉ nhận khi `type === "calendar_event_detail"` (sai → bỏ, dòng đó không có nút chi tiết).

**Tại sao:** spec §55 "Nếu `calendar_events` rỗng hoặc không có `detail_action`, FE không hiển thị nút chi tiết". Payload từ mạng không được tin — một dòng hỏng không được làm hỏng cả bảng.

**Rủi ro đã cân nhắc:** JSON `done` bị cắt giữa 2 chunk mạng → mất event. Đã có sẵn: `streamPersonalChat` buffer theo `\n\n` (comment trong code, fix cũ của #baocaocv). Ta dùng lại buffer đó, không tự parse chunk.

**Đánh đổi:** loại thầm lặng dòng thiếu `event_id` (không log). Nếu BE quên `event_id`, dòng biến mất không báo. Chấp nhận vì đây là dữ liệu hiển thị, không phải giao dịch; và log rác cho mỗi payload lỗi không đáng.

### 2.3. Nút "Xem chi tiết" → `getEvent` → `EventDetailModal`

**Viết thế nào:** bấm → `hrCalendarApi.getEvent(event_id)` → map → mở `EventDetailModal` (đã dùng chung ở `/calendar` và `WeeklyCalendarWidget`).

**Tại sao:** spec ưu tiên "mở UI chi tiết lịch trực tiếp". Modal + API + mapping **đã tồn tại**, không viết lại.

**🔴 RỦI RO LỚN NHẤT — `event_id` có phải UUID sự kiện HR không?**
- Service AI (`ai.hacomholdings.com.vn`) **nằm ở repo khác, không có trong workspace** → **không kiểm chứng được từ source** `event_id` được sinh thế nào.
- Nếu `event_id` **là** UUID HR → `getEvent` chạy đúng, mở modal.
- Nếu `event_id` **là mã nội bộ AI** (vd `"ev1"` như mẫu spec) → `getEvent` **404**.

**Xử lý rủi ro:** `.catch()` → `toast.error("Không mở được chi tiết sự kiện này.")`, **không vỡ UI**. Đây là nhánh fallback spec §56/§78 cho phép ("chưa có màn chi tiết thì báo nhẹ").

**➡️ VIỆC BẠN CẦN LÀM:** xác nhận với team BE-AI `event_id` là UUID sự kiện HR hay mã nội bộ.
- Nếu **mã nội bộ** → nút sẽ luôn rơi vào toast. Khi đó đổi hành vi sang gửi follow-up `Chi tiết sự kiện này` (spec §78) — cần thêm việc nối `sendMessage` xuống bubble.

### 2.4. Sửa / Xóa / Phản hồi — đi qua LUỒNG DUY NHẤT

**Viết thế nào:** `CalendarEventTable` dùng `useCalendarEventMutations()`:
- Xóa → `mutations.remove(id)` (qua `calendarStore.deleteEvent` → hr-api).
- Phản hồi → `mutations.respond(id, "ACCEPTED"|"DECLINED")` (qua `hrCalendarApi.updateMyResponse`).
- Sửa → **điều hướng** `navigate("/calendar", { state:{ openEventId, view:"week" }})`.

**Tại sao đây là câu trả lời cho câu hỏi "các nơi lịch khác có đồng bộ không":**
`useCalendarEventMutations` là **nguồn ghi DUY NHẤT** của lịch (comment đầu file hook: "dùng chung cho CalendarPage và WeeklyCalendarWidget để hai màn hình hành xử GIỐNG HỆT"). Mọi mutation đi qua `calendarStore` + hr-api. Vì vậy:
- Xóa ở chat → `calendarStore.deleteEvent` xóa thẳng khỏi `events[]` → trang `/calendar` / widget đang mở **tự cập nhật**.
- Không có luồng thứ hai để phải xóa. **Không nhân đôi logic.**

**🔴 RỦI RO BẢO MẬT — quyền Sửa/Xóa/Phản hồi lấy từ đâu?**
Không phải FE tự quyết. `HRCalendarEvent` do BE trả **có sẵn** `canEdit`, `canDelete`, `canViewFullDetails`, `isParticipant` (`hrCalendarApi.ts:95-98`). `EventDetailModal` chỉ hiện:
- Sửa/Xóa khi `!isViewingOthers && event.canEdit/canDelete && có handler` (`EventDetailModal.tsx:224-225`).
- Phản hồi khi `hrEvent.isParticipant && !canEdit && có onRespond` (`:182`).

**➡️ Server là nơi ra quyết định quyền.** FE chỉ hiển thị theo cờ. Kể cả user cố gọi `remove`, hr-api vẫn kiểm quyền phía server. Không có lỗ hổng "client tự tin".

**Bug đã sửa (phiên trước):** ban đầu tôi hardcode `isViewingOthers` + không truyền handler → **lịch của chính user cũng bị khóa Sửa/Xóa** như lịch người khác. Đã bỏ hardcode → modal tự tính quyền từ `canEdit/canDelete`. Lịch của bạn: hiện đủ; lịch người khác: ẩn (vì BE trả `canEdit=false`).

**Đánh đổi "Sửa" điều hướng sang /calendar thay vì mở form tại chỗ:**
- *Được:* không nhân đôi cây form họp/cá nhân (`MeetingFormModal` + `PersonalEventFormModal` + ~80 dòng map HR→FormData của `CalendarPage.handleEditEvent`). Một chỗ sửa form → mọi nơi đúng.
- *Mất:* user rời khỏi chat để sửa. Và deep-link chỉ mở được event nếu nó nằm trong **tháng CalendarPage load mặc định** (giới hạn CÓ SẴN của cơ chế `openEventId`, giống hệt `WeeklyCalendarWidget` đang dùng — không phải bug mới).
- *Muốn full-form-in-chat?* Được, nhưng nặng: lắp 2 form modal + state upload đính kèm + rủi ro lệch với trang Lịch. Chưa làm vì spec không yêu cầu.

---

## 3. Khả năng mở rộng

| Muốn mở rộng | Có dễ không | Cần làm gì |
|---|---|---|
| Thêm cột (vd Trạng thái) | Dễ | Thêm vào `HEADERS` + 1 `<td>`; type `CalendarEventRow` thêm field; `normalizeCalendarEvents` thêm `pickString`. |
| Đổi hành vi nút sang follow-up chat | Trung bình | Nối `sendMessage` từ `usePersonalChat` xuống `PersonalMessageBubble` → `CalendarEventTable`; thay `getEvent` bằng gửi câu hỏi. |
| Sửa form ngay trong chat | Khó/nặng | Tái dùng `MeetingFormModal`/`PersonalEventFormModal` + copy logic map HR→FormData. Cân nhắc tách `handleEditEvent` của CalendarPage thành hook dùng chung trước. |
| Dùng bảng lịch ở màn khác | Dễ | `CalendarEventTable` chỉ phụ thuộc `CalendarEventRow[]` + hạ tầng lịch — bê nguyên sang chỗ khác được. |

**Điểm nghẽn mở rộng đã biết:** logic "map HR event → MeetingFormData/PersonalEventFormData" hiện **chỉ nằm trong `CalendarPage.handleEditEvent`**, chưa tách hook. Nếu sau này cần sửa form ở nhiều nơi, nên tách nó ra `useEditCalendarEvent` trước — hiện chưa cần nên chưa làm (YAGNI).

---

## 4. Đã test gì

| Kiểm chứng | Lệnh | Kết quả |
|---|---|---|
| Type an toàn toàn dự án | `npm run typecheck` | ✅ sạch |
| Build production (bắt lỗi casing import Win↔CI) | `npm run build` | ✅ built |
| Parse `calendar_events` qua SSE thật (mock stream) | `vitest run …/personalAiApi.test.ts` | ✅ 5/5 |
| Lint 3 file mới/sửa nhiều | `eslint CalendarEventTable/personalAiApi/types` | ✅ exit 0 |

**3 test mới (trong `personalAiApi.test.ts`):**
1. Parse đúng `calendar_events`, giữ `detail_action` hợp lệ, **loại dòng thiếu `event_id`**.
2. `detail_action` sai type → **bỏ action nhưng giữ dòng** (dòng vẫn hiện, chỉ không có nút).
3. Câu trả lời không phải lịch → `calendar_events` = `undefined` (không ép bảng).

**Chưa test (giới hạn tự nhận):**
- Hành vi click mở modal / Sửa / Xóa / Phản hồi **chưa có test tương tác** (cần render React + mock hr-api). Đã kiểm bằng type + đối chiếu đúng cách `CalendarPage` gọi cùng `mutations`. Nếu bạn muốn, thêm test component với `@testing-library/react`.
- **Chưa chạy thật với BE** vì phụ thuộc `event_id` (mục 2.3) — cần môi trường có service AI + hr-api thật.

---

## 5. Việc còn treo cho bạn quyết

1. **Xác nhận `event_id`** là UUID HR hay mã nội bộ (mục 2.3). Đây là điều **quyết định nút chi tiết chạy hay luôn toast**.
2. **"Sửa" — điều hướng sang /calendar** có chấp nhận không, hay cần mở form ngay trong chat (mục 2.4 đánh đổi).
3. **Test tương tác** cho modal/sửa/xóa — có cần bổ sung không.
4. Lỗi lint `react-hooks/set-state-in-effect` ở `usePersonalChat.ts:81` là **code cũ** (không thuộc thay đổi này) — có muốn gộp sửa luôn không hay để riêng.
