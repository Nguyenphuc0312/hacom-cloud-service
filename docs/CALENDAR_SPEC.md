# CALENDAR_SPEC.md — Đặc tả sản phẩm Calendar Day/Week View (Teams-like)

Đặc tả sản phẩm (Product Spec) cho **Lịch theo Ngày (Day View)** và **Lịch theo Tuần (Week View)** trên `chat-web-client`, mục tiêu trải nghiệm tiệm cận Microsoft Teams Calendar.

> Tài liệu này mô tả **sản phẩm cần đạt** (yêu cầu + tiêu chí nghiệm thu), không phải hướng dẫn UI thuần. Hợp đồng API: **`APIcalendar.md`**. Token màu/UI: **`WEBFE.md`**. Kiến trúc FE: **`CLAUDE.md`**.

---

## 0. Mục tiêu & Phạm vi

**Mục tiêu:** Day/Week View hiển thị đúng theo dòng thời gian (timeline), cho phép tạo/sửa lịch trực tiếp trên lưới (double-click, drag, resize), hiển thị realtime, và đạt ~85–90% trải nghiệm Calendar của Microsoft Teams.

**Trong phạm vi:** Day View, Week View, tạo/sửa/xóa event trên lưới, current-time indicator, overlap, all-day & multi-day event, presence trong lịch, hover meeting card, realtime, nhắc lịch, meeting link, lọc & tìm kiếm.

**Ngoài phạm vi (đợt này):** Month View (đã có), lịch đơn vị `/calendar/units/*` (BE chưa có), đồng bộ lịch ngoài (Google/Outlook).

**Nền tảng hiện tại:** `features/calendar/components/DayView.tsx`, `WeekView.tsx`, điều phối tại `pages/CalendarPage.tsx`, store `stores/calendarStore.ts`, dữ liệu từ **hr-api-service** (xem `APIcalendar.md`).

---

## 1. Hiện trạng vs. Mục tiêu (Gap Analysis)

| # | Hạng mục | Hiện trạng (code) | Mục tiêu (Teams-like) | Mức |
|---|---|---|---|---|
| 1 | Khung 24h | ✅ DayView 60px/h, WeekView 48px/h | Giữ; slot phụ 15/30 phút | Nâng cấp |
| 2 | Slot tạo nhanh | ❌ chỉ nút "+ Thêm lịch họp" → modal | Double-click ô trống + kéo chọn khoảng | **Thiếu** |
| 3 | Chiều cao theo thời lượng | ❌ event là block cố định, chỉ đặt theo giờ bắt đầu (`event.time`) | Cao = (endAt − startAt); dùng `startAt/endAt` | **Thiếu** |
| 4 | Overlap (trùng giờ) | ❌ event đè lên nhau | Chia cột tự động, tối đa 3 cột, hover xem đủ | **Thiếu** |
| 5 | Drag-move / resize | ❌ chưa có | Kéo đổi giờ/ngày; resize đổi duration; lưu qua API | **Thiếu** |
| 6 | Current-time indicator | ⚠️ có line đỏ nhưng tính 1 lần lúc render | Tick mỗi phút + auto-scroll tới giờ hiện tại khi mở | Nâng cấp |
| 7 | Điều hướng tuần | ⚠️ WeekView khóa "tuần đầu của tháng" (`getWeekDays(year, month)`) | Điều hướng theo tuần: ‹ Tuần trước · Hôm nay · Tuần sau ›; header "Tuần 24 · 09/06–15/06" | **Thiếu** |
| 8 | All-day event | ❌ chưa có hàng riêng | Hàng "ALL DAY" trên đầu lưới | **Thiếu** |
| 9 | Multi-day event | ❌ chưa có | Event nghỉ phép trải nhiều cột (Mon→Thu) | **Thiếu** |
| 10 | Presence trong lịch | ❌ lịch không hiện presence | "Busy · In a meeting until 10:30" (dùng presence WS sẵn có) | **Thiếu** |
| 11 | Hover meeting card | ❌ click mới mở modal | Hover hiện card: organizer, participants, Join/Edit/Delete | **Thiếu** |
| 12 | Realtime | ❌ chỉ polling 30s cho thông báo (`HrNotificationBell`) | WS `calendar:event_created/updated/deleted` | **Thiếu (cần BE)** |
| 13 | Nhắc lịch | ❌ chưa có | 15’/30’/1h/1 ngày trước | **Thiếu (cần BE)** |
| 14 | Meeting link | ⚠️ chỉ free-text location | Meet/Zoom/Teams/Internal có cấu trúc | **Thiếu (cần BE)** |
| 15 | Lọc | ⚠️ My + xem user khác; unit = TODO | My / Team / Department / Company Events | Một phần |
| 16 | Tìm kiếm | ⚠️ theo tên/mô tả (sidebar) | + theo organizer & participant | Một phần |
| 17 | Bảng màu theo loại | ⚠️ meeting=teal, personal=amber, attendance=emerald | Meeting=xanh dương, Training=tím, Interview=cam, Leave=đỏ, Personal=xanh lá (qua token) | Nâng cấp |

> **Tiền đề kỹ thuật quan trọng:** DayView/WeekView hiện nhận `LocalCalendarEvent` (`date` + `time` string, **không có endAt**). Để làm mục #3/#4/#5 phải cho 2 view tiêu thụ `startAt/endAt` (kiểu `ExtendedCalendarEvent`/`HRCalendarEvent` — xem `CalendarPage.tsx`). Đây là refactor bắt buộc làm trước.

---

## 2. Day View — Đặc tả chức năng

### 2.1 Bố cục
```
+------------------------------------------------------+
| ‹ Hôm qua | Hôm nay | Ngày mai ›        15/06/2026   |
+------------------------------------------------------+
| [ALL DAY]  Company Event · Holiday                   |
+------------------------------------------------------+
| Giờ   | Sự kiện                                      |
| 08:00 | ┌ Daily Meeting ───────┐                     |
|       | │ 08:00–09:00 · 15 người│                     |
| 09:00 | └───────────────────────┘                    |
| 10:00 | ┌ Review Sprint ────────┐                     |
|       | │ 10:00–11:30           │                     |
|       | └───────────────────────┘                    |
|  ───── 14:35 (line đỏ) ─────────────────────────     |
+------------------------------------------------------+
```

### 2.2 Yêu cầu
- **FR-D1 Hiển thị 24h.** Lưới 00:00–23:00. Cấu hình độ chia slot: **15 hoặc 30 phút** (mặc định 30).
- **FR-D2 Current time.** Line đỏ tại vị trí giờ hiện tại; **cập nhật mỗi phút**; **auto-scroll** tới giờ hiện tại khi mở view.
- **FR-D3 Chiều cao theo thời lượng.** Block cao tỉ lệ `endAt − startAt`; tối thiểu hiển thị tiêu đề + khoảng giờ.
- **FR-D4 Tạo nhanh.** Double-click ô trống → mở `MeetingFormModal` với ngày/giờ điền sẵn theo slot; **kéo chọn khoảng** → điền sẵn start/end.
- **FR-D5 Chỉnh sửa trực tiếp.** Kéo block lên/xuống đổi giờ; resize cạnh trên/dưới đổi duration; thả → gọi `hrCalendarApi.updateEvent` (optimistic, rollback nếu lỗi). Chỉ bật khi `event.canEdit`.
- **FR-D6 Mở chi tiết.** Click block → `EventDetailModal` (đã có).
- **FR-D7 All-day.** Hàng "ALL DAY" trên cùng cho `isAllDay`.
- **FR-D8 Điều hướng.** ‹ Hôm qua · Hôm nay · Ngày mai › đổi `selectedDate`, refetch đúng range.

---

## 3. Week View — Đặc tả chức năng

### 3.1 Bố cục
```
+-------------------------------------------------------------------+
| ‹ Tuần trước | Hôm nay | Tuần sau ›   Tuần 24 · 09/06–15/06/2026  |
+-------------------------------------------------------------------+
|       T2     T3     T4     T5     T6     T7     CN                 |
| [ALLDAY]   Leave  Leave  Leave                                    |
+-------------------------------------------------------------------+
| 08:00 |[Mtg][Mtg]|      |      |      |      |      |             |
| 10:00 |          |[Itv] |      |      |      |      |             |
|  ─ 14:35 (đỏ, chỉ cột hôm nay) ─                                  |
+-------------------------------------------------------------------+
```

### 3.2 Yêu cầu
- **FR-W1 7 cột T2→CN.** Header mỗi ngày: thứ + ngày; tô đậm "hôm nay".
- **FR-W2 Điều hướng theo TUẦN.** Thay logic `getWeekDays(year, month)` (đang khóa tuần-đầu-tháng) bằng tuần chứa `selectedDate`. Header hiện **số tuần ISO + khoảng ngày**.
- **FR-W3 Event card.** Hiện tiêu đề, khoảng giờ, số người tham gia; cao theo thời lượng.
- **FR-W4 Overlap.** Cùng ngày trùng giờ → chia cột đều, **tối đa 3 cột**, phần dư gộp "+N"; hover phóng to xem đủ.
- **FR-W5 Current time.** Line đỏ chỉ trên cột hôm nay, tick mỗi phút.
- **FR-W6 All-day & multi-day.** Hàng all-day trên đầu; event nhiều ngày (nghỉ phép) trải ngang qua các cột liên tiếp.
- **FR-W7 Tạo/sửa.** Như Day View (double-click, kéo tạo, drag-move/resize) trong phạm vi cột ngày.

---

## 4. Tính năng kiểu Teams (chi tiết)

- **Presence trong lịch (FR-P).** Dùng presence WS sẵn có (`presenceStore`, xem `[[project_presence_single_source]]`): trên card/avatar người tham gia hiển thị Available/Busy/Away/Offline; khi đang trong meeting → "Busy · In a meeting until HH:mm" suy ra từ event đang diễn ra. **Online/offline chỉ lấy từ live WS presence, không dùng trường status backend.**
- **Hover meeting card (FR-H).** Hover event → popover: tiêu đề, khoảng giờ, **Organizer** (`owner`), **Participants** (đếm + danh sách rút gọn), nút **Join Meeting** (nếu có link), **Edit**/**Delete** (theo `canEdit`/`canDelete`).
- **Drag & Drop realtime (FR-DnD).** Kéo sang ngày/giờ khác, resize duration → cập nhật optimistic + persist; phát/nhận realtime cho người liên quan.
- **Current Time Indicator (FR-CTI).** Tick mỗi phút, tự dịch chuyển; auto-scroll khi mở.
- **All-day / Multi-day (FR-ADM).** Như FR-D7/FR-W6.

---

## 5. Hợp đồng API

### 5.1 Đã có (xem `APIcalendar.md` — hr-api-service)
| Việc | Hàm FE | HTTP |
|---|---|---|
| Lấy lịch theo khoảng | `hrCalendarApi.listEvents({from,to,…})` | `GET /calendar/events?from&to&…` |
| Tạo | `hrCalendarApi.createEvent` | `POST /calendar/events` |
| Sửa (drag/resize dùng chung) | `hrCalendarApi.updateEvent` | `PATCH /calendar/events/:id` |
| Xóa | `hrCalendarApi.deleteEvent` | `DELETE /calendar/events/:id` |
| Phản hồi mời | `hrCalendarApi.updateMyResponse` | `PATCH /calendar/events/:id/participants/me` |

> Lưu ý khác biệt với draft "lý tưởng": FE hiện dùng `from`/`to` dạng `YYYY-MM-DD` và `startAt/endAt` ISO UTC (không phải `startDate/endDate`). **Quy ước thời gian: nhập local → `toISOString()` (KHÔNG nối "Z"); render ISO→local.** Xem `APIcalendar.md` mục 8.

### 5.2 Cần bổ sung ở BACKEND (hr-api-service) — FE chưa thể làm nếu thiếu
- **Realtime WS:** `calendar:event_created` / `calendar:event_updated` / `calendar:event_deleted` (kèm payload event + danh sách người ảnh hưởng). Hiện FE **không có** kênh realtime cho lịch (chỉ polling thông báo 30s) → cần BE phát sự kiện, FE đăng ký trong `features/chat/realtime/register*` hoặc kênh HR riêng.
- **Nhắc lịch (reminders):** field `reminders: [{minutesBefore}]` + cơ chế đẩy thông báo (15’/30’/1h/1 ngày).
- **Meeting link có cấu trúc:** `meetingLink: { provider: GOOGLE_MEET|TEAMS|ZOOM|INTERNAL, url }` (hiện chỉ free-text `location`).
- **Loại event mở rộng:** enum hiện là `MEETING|TASK|LEAVE|DEADLINE|REMINDER|OTHER` — **chưa có** `TRAINING`/`INTERVIEW`; nếu cần màu riêng (mục 6) phải thêm enum BE hoặc map qua `metadata`.

---

## 6. Bảng màu theo loại event

Triển khai **qua token** (không hardcode tùy tiện — xem `WEBFE.md`). App nền **xanh dương**; đỏ/vàng thương hiệu **chỉ** dành cho SideRail/Login.

| Loại | Màu mục tiêu | Ghi chú token |
|---|---|---|
| Meeting | Xanh dương | `#1976D2 / #1565C0` (brand app) |
| Training | Tím | thêm token loại mới |
| Interview | Cam | thêm token loại mới |
| Leave | Đỏ | dùng semantic `--color-danger` (≠ brand đỏ) |
| Personal | Xanh lá | semantic success |
| Attendance (hiện có) | Emerald | giữ |
| Task (hiện có) | theo `getEventColor('task')` | giữ |

> Hiện `getEventColor` (trong `features/calendar/data/calendarEvents.ts`) dùng meeting=teal/personal=amber. Cần thống nhất lại theo bảng trên + bổ sung Training/Interview khi BE có enum.

---

## 7. Tiêu chí nghiệm thu (Acceptance Criteria) — rút gọn

- **AC1:** Mở Day/Week View tự cuộn tới giờ hiện tại; line đỏ nhích mỗi phút.
- **AC2:** Event cao đúng tỉ lệ thời lượng; 2 event trùng giờ chia cột (≤3), không đè khuất.
- **AC3:** Double-click ô trống mở modal tạo với giờ điền sẵn; kéo chọn khoảng điền đúng start/end.
- **AC4:** Kéo/resize event có `canEdit` → lưu thành công, hiển thị optimistic, rollback khi API lỗi; event `canEdit=false` không kéo được.
- **AC5:** Week View điều hướng theo tuần (không khóa tuần-đầu-tháng); header hiện số tuần + khoảng ngày.
- **AC6:** All-day & multi-day (nghỉ phép) hiển thị đúng ở hàng all-day / trải nhiều cột.
- **AC7:** Hover event hiện meeting card với organizer/participants/Join/Edit/Delete theo quyền.
- **AC8 (khi BE sẵn sàng):** Tạo/sửa/xóa ở client khác phản ánh realtime qua `calendar:event_*` mà không cần reload.
- **AC9:** Mọi thao tác giữ **optional-feature contract** — lỗi HR không bao giờ đăng xuất/làm hỏng phiên chat (xem `APIcalendar.md` mục 1 & 6).

---

## 8. Lộ trình đề xuất (Phasing)

- **Phase 1 — Nền timeline (FE thuần, dùng API sẵn có):** refactor 2 view sang `startAt/endAt`; chiều cao theo duration; overlap ≤3 cột; current-time tick + auto-scroll; điều hướng tuần đúng. → AC1, AC2, AC5.
- **Phase 2 — Tương tác trên lưới:** double-click/drag tạo; drag-move/resize + optimistic update; hover meeting card; all-day & multi-day. → AC3, AC4, AC6, AC7.
- **Phase 3 — Realtime & nâng cao (cần BE):** WS `calendar:event_*`; reminders; meeting link có cấu trúc; presence "in a meeting until"; lọc Team/Dept/Company; tìm theo organizer/participant. → AC8 + mục 4/5.2.

---

*Tham chiếu: `APIcalendar.md` (API), `WEBFE.md` (màu/token), `CLAUDE.md` (kiến trúc), `WEBBE.md` (backend chat-api). Realtime/nhắc lịch/meeting-link cần phối hợp hr-api-service.*
