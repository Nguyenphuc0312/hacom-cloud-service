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

### 2.4. Sửa / Xóa / Phản hồi — IN-PLACE trên màn chat, LUỒNG DUY NHẤT

**Viết thế nào:** `CalendarEventTable` dùng `useCalendarEventMutations()`, làm mọi thao tác NGAY TRÊN MÀN CHAT (không rời trang):
- Xóa → `mutations.remove(id)` (qua `calendarStore.deleteEvent` → hr-api) → **gạch luôn dòng khỏi bảng** (`patchMessage(message.calendarEvents = còn lại)`).
- Phản hồi → `mutations.respond(id, …)` → refetch event để modal cập nhật trạng thái.
- Sửa → mở đúng `MeetingFormModal`/`PersonalEventFormModal` **ngay trong chat**, prefill bằng hàm thuần `buildCalendarEventForm(hrEvent)` (mục 2.5) → lưu qua `mutations.updateMeeting/updatePersonal`.

> **Lịch sử:** bản đầu tôi cho "Sửa" điều hướng sang `/calendar`. Bạn phản hồi phải thao tác ngay trên màn AI → đổi sang mở form in-place. Bản đầu Xóa cũng chưa gạch dòng ("xóa xong bảng vẫn hiện dòng cũ") → đã fix.

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

### 2.5. Tách hàm thuần `buildCalendarEventForm(hrEvent)` — tránh copy-paste

**Vấn đề:** logic prefill form Sửa (map HR event → MeetingFormData/PersonalEventFormData, phân nhánh personal vs meeting, metadata, participants, attachments, visibility) vốn nằm **trong** `CalendarPage.handleEditEvent` (~80 dòng, dùng nhiều helper cục bộ của trang). Chat cần đúng logic đó.

**Cách làm (craft):** trích thành **hàm THUẦN** `buildCalendarEventForm(event: HRCalendarEvent)` trong `calendarEventMapping.ts` (nơi đã có các map lịch khác). Nhận thẳng HR event (chat đã fetch qua `getEvent`), trả `{ kind:'meeting'|'personal', data } | null`. Có test riêng.

**Đánh đổi có chủ đích:** hiện **CHƯA gộp** `CalendarPage.handleEditEvent` để dùng hàm mới này — giữ nguyên để **tránh rủi ro hồi quy trang Lịch** (trang Lịch đang chạy ổn, refactor nó ngoài phạm vi task). Hệ quả: **tạm thời có 2 nơi cùng ý nghĩa prefill**. Đã đánh dấu bằng `ponytail:` trong code + JSDoc: nếu sau này đổi quy tắc prefill, đồng bộ cả 2 (hoặc refactor CalendarPage dùng hàm chung — việc riêng, làm sau).

### 2.6. Xóa → gạch dòng khỏi bảng (fix "xóa xong bảng vẫn hiện dòng cũ")

**Gốc lỗi:** bảng render từ `message.calendarEvents` — một **snapshot tĩnh** của tin nhắn. Xóa event trên hr-api không tự đụng snapshot này → dòng cũ vẫn hiện.

**Fix:** sau khi `remove` thành công, `patchMessage(message.calendarEvents = danh sách còn lại)`. Bảng re-render, dòng biến mất.

**Bẫy đã xử lý:** khi xóa **hết** → mảng `[]`. Điều kiện render cũ `calendarEvents.length > 0` sẽ false → **rơi về markdown** = hiện lại TẤT CẢ dòng gốc (tệ hơn). Đã đổi điều kiện thành **`!!message.calendarEvents`** (có tồn tại, kể cả rỗng) → luôn render bảng; mảng rỗng hiện dòng "Đã xóa hết sự kiện...". Chỉ `undefined` (câu trả lời không phải lịch) mới về markdown.

**KHÔNG làm cho Sửa:** không patch lại dòng sau khi sửa. Lý do: bảng là snapshot markdown BE (`day="Thứ Hai 06/07"`, `time="16:00-17:30"`), form trả date/time thô (`YYYY-MM-DD`, `HH:mm`) — ghép vào lệch định dạng, hại hơn. Nguồn thật (lịch) đã cập nhật; muốn xem lại theo dữ liệu mới thì hỏi lại lịch. Đánh dấu `ponytail:` trong code.

**Đánh đổi form-in-chat:** phải lắp 2 form modal + tái tạo prefill (mục 2.5). Nặng hơn điều hướng, nhưng đúng yêu cầu "thao tác trên màn AI". Rủi ro lệch với trang Lịch được giảm bằng cách **dùng chung form modal + mutations** (chỉ prefill là tạm tách).

---

## 3. Khả năng mở rộng

| Muốn mở rộng | Có dễ không | Cần làm gì |
|---|---|---|
| Thêm cột (vd Trạng thái) | Dễ | Thêm vào `HEADERS` + 1 `<td>`; type `CalendarEventRow` thêm field; `normalizeCalendarEvents` thêm `pickString`. |
| Đổi hành vi nút sang follow-up chat | Trung bình | Nối `sendMessage` từ `usePersonalChat` xuống `PersonalMessageBubble` → `CalendarEventTable`; thay `getEvent` bằng gửi câu hỏi. |
| Sửa form ngay trong chat | ✅ Đã làm | Dùng `MeetingFormModal`/`PersonalEventFormModal` + `buildCalendarEventForm` (hàm thuần). |
| Dùng bảng lịch ở màn khác | Dễ | `CalendarEventTable` phụ thuộc `CalendarEventRow[]` + hạ tầng lịch + `conversationId/messageId` (để patch bảng) — tách 2 prop này ra là bê được. |

**Điểm nghẽn mở rộng đã biết:** prefill form Sửa giờ có ở **2 nơi** — `CalendarPage.handleEditEvent` (cũ) và `buildCalendarEventForm` (mới, chat dùng). Đánh dấu `ponytail:`. Muốn 1 nguồn: refactor `CalendarPage.handleEditEvent` gọi `buildCalendarEventForm` — việc riêng, có rủi ro hồi quy trang Lịch nên tách khỏi task này.

---

## 4. Ma trận test — từng trường hợp

### 4.1. Tự động (đã chạy, xanh)

| Kiểm chứng | Lệnh | Kết quả |
|---|---|---|
| Type toàn dự án | `npm run typecheck` | ✅ sạch |
| Build production (bắt lỗi casing import Win↔CI) | `npm run build` | ✅ built |
| Parse `calendar_events` qua SSE (mock stream) | `vitest …/personalAiApi.test.ts` | ✅ 5/5 |
| `buildCalendarEventForm` map HR→form (meeting + personal) | `vitest …/calendarEventMapping.test.ts` | ✅ 10/10 |
| Lint file mới (`CalendarEventTable`, `calendarEventMapping`) | `eslint …` | ✅ exit 0 |

**5 test mới:**
- (SSE) parse đúng + **loại dòng thiếu `event_id`**; `detail_action` sai type → bỏ action giữ dòng; câu trả lời không phải lịch → `undefined`.
- (form) MEETING → meeting form đủ chairman/format/participants(HR+free-text)/visibility/location; PERSONAL → personal form, `visibility=private`.

### 4.2. Cần bạn kiểm thủ công (trace logic đã đúng, nhưng chưa có test tương tác)

| # | Trường hợp | Kỳ vọng | Đường code |
|---|---|---|---|
| 1 | Hỏi "lịch tuần này" có sự kiện | Bảng 5 cột, mỗi dòng có nút "Xem chi tiết" | `PersonalMessageBubble` → `CalendarEventTable` |
| 2 | Không có lịch (`calendar_events` rỗng lúc đầu) | Text thường, KHÔNG bảng | `calendarEvents=undefined` → markdown |
| 3 | Bấm "Xem chi tiết" (event_id là UUID HR) | Mở modal đầy đủ | `getEvent` OK → `EventDetailModal` |
| 4 | Bấm "Xem chi tiết" (event 404) | Toast "Không mở được…" + **log `event_id`** ở console | `getEvent` catch |
| 5 | Lịch của MÌNH → modal | Hiện **Sửa + Xóa** | `canEdit/canDelete=true` từ BE |
| 6 | Lịch NGƯỜI KHÁC → modal | Ẩn Sửa/Xóa, có thể có Phản hồi | `canEdit=false` từ BE |
| 7 | Bấm **Sửa** (lịch họp) | Mở `MeetingFormModal` **trong chat**, prefill đúng | `buildCalendarEventForm` kind=meeting |
| 8 | Bấm **Sửa** (lịch cá nhân) | Mở `PersonalEventFormModal` trong chat | kind=personal |
| 9 | Lưu form sửa | Cập nhật hr-api, đóng form; /calendar đồng bộ | `updateMeeting/updatePersonal` |
| 10 | Bấm **Xóa** → xác nhận | Event xóa, **dòng biến mất khỏi bảng** | `remove` + `removeRowFromTable` |
| 11 | Xóa **hết** dòng | Bảng hiện "Đã xóa hết sự kiện…" (KHÔNG hiện lại dòng cũ) | điều kiện `!!calendarEvents` |
| 12 | **Phản hồi** Tham gia/Từ chối (là participant) | Cập nhật, trạng thái đổi trong modal | `respond` + refetch |
| 13 | Mobile: bảng tràn ngang | Cuộn ngang, nút vẫn đúng dòng | `overflow-x-auto` + nút ở cell riêng |
| 14 | Tải lại trang (reload lịch sử) | Bảng về markdown (snapshot không lưu server) | `calendarEvents` không có trong history |

> #4 quan trọng: mở **Console** khi bấm nút lỗi → xem log `open-detail-failed` kèm `event_id`. Đây là cách xác định `event_id` là UUID HR (đã xóa) hay chuỗi lạ.

---

## 5. Việc còn treo cho bạn quyết

1. **Xác nhận `event_id`** (mục 2.3): dùng log ở case #4 để soi. Từ ảnh bạn gửi, event mở được modal chứng minh **ÍT NHẤT một số event_id LÀ UUID HR thật**; event toast lỗi có thể đã bị xóa hoặc id lạ.
2. **Test tương tác** (case #1-14) cho modal/sửa/xóa/phản hồi — có cần viết `@testing-library/react` không, hay bạn tự QA thủ công.
3. **Prefill 2 nơi** (mục 2.5): có muốn tôi refactor `CalendarPage` dùng chung `buildCalendarEventForm` luôn không (rủi ro hồi quy trang Lịch, nên làm riêng).
4. Lỗi lint `react-hooks/*` ở `usePersonalChat.ts:81` + `PersonalMessageBubble.tsx:546` là **code cũ** (không thuộc thay đổi này) — gộp sửa hay để riêng.
