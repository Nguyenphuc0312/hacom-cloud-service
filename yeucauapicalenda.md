# Yêu cầu API — Lịch cá nhân (Personal Event)

> File này ghi lại yêu cầu thay đổi backend (`hr-api-service`) để hỗ trợ đầy đủ
> tính năng **Lịch cá nhân** trên web client. Tạo ngày 2026-06-15.
> Liên quan: `APIcalendar.md` (hợp đồng API lịch), `CalendarPage.tsx`,
> `PersonalEventFormModal.tsx`.

---

## 1. Bối cảnh

FE vừa thêm chức năng **"Thêm lịch cá nhân"** (form đơn giản: nội dung, ngày,
giờ bắt đầu/kết thúc, ghi chú). Khi lưu, FE gọi endpoint sẵn có:

```
POST /calendar/events
```

với payload kiểu lịch cá nhân:

```jsonc
{
  "title": "Khám sức khỏe định kỳ",
  "description": "ghi chú (tùy chọn)",
  "startAt": "2026-06-15T01:00:00.000Z",   // ISO UTC (đã convert từ local)
  "endAt":   "2026-06-15T02:00:00.000Z",
  "eventType": "PERSONAL",                  // ❌ KHÔNG hợp lệ với enum hiện tại
  "visibility": "PRIVATE",
  "isAllDay": false,
  "timezone": "Asia/Ho_Chi_Minh"
}
```

## 2. Vấn đề — thiếu enum `PERSONAL` (đã kiểm chứng tại source backend)

Đã đối chiếu trực tiếp source `hr-api-service` (không chỉ dựa vào type FE):

- **DB enum** — `prisma/schema.prisma:763`:
  ```prisma
  enum CalendarEventType {
    MEETING
    TASK
    LEAVE
    DEADLINE
    REMINDER
    OTHER
  }
  ```
- **Validation DTO** — `src/modules/calendar/dto/calendar.dto.ts:106`:
  `CreateCalendarEventDto.eventType` dùng `@IsEnum(CalendarEventType)` (và alias
  `type` cũng vậy). Gửi `"PERSONAL"` → **422 validation error**.
- **Default backend** — `src/modules/calendar/calendar.service.ts:259`:
  ```ts
  const resolvedEventType = dto.eventType ?? dto.type ?? CalendarEventType.OTHER;
  ```
  Khi không truyền `eventType`, backend tự đặt `OTHER`. Comment
  `calendar.service.ts:968`: *"user can still have personal calendar events"* →
  lịch cá nhân hiện được lưu dưới `OTHER`.

➡️ **Kết luận: enum `PERSONAL` thật sự KHÔNG tồn tại ở backend.** Đây là lý do
lịch cá nhân không tạo được khi FE gửi `eventType: "PERSONAL"`.

> Lưu ý: capability `canCreatePersonalEvent` ghi trong `APIcalendar.md` §2.1
> **không tìm thấy trong source `hr-api-service`** — có thể là tài liệu FE cũ/
> chưa khớp backend. Cần backend xác nhận lại.

## 3. Giải pháp tạm thời đang áp dụng ở FE (stopgap)

Để không chặn người dùng, FE tạm thời:

- Gửi `eventType: "OTHER"` + `visibility: "PRIVATE"` cho lịch cá nhân — **đúng
  bằng giá trị backend tự default cho event không có eventType**
  (`calendar.service.ts:259`), nên tương thích hoàn toàn.
- Map ngược `OTHER → "personal"` khi hiển thị/lọc trên lịch
  (`mapApiEventTypeToLocal` trong `CalendarPage.tsx`).

⚠️ Hệ quả của stopgap: **mọi** event `OTHER` từ backend (kể cả không phải lịch
cá nhân) sẽ bị hiển thị dưới nhóm "Cá nhân". Cần backend bổ sung type riêng để
phân loại chính xác.

## 4. Yêu cầu backend

### 4.1 (Khuyến nghị) Thêm giá trị enum `PERSONAL`

Thêm `PERSONAL` vào enum `eventType` (Prisma enum + validation `POST/PATCH
/calendar/events`):

```
MEETING | TASK | LEAVE | DEADLINE | REMINDER | OTHER | PERSONAL
```

Yêu cầu cụ thể:

| # | Nội dung |
|---|----------|
| 1 | `POST /calendar/events` chấp nhận `eventType: "PERSONAL"`. |
| 2 | `GET /calendar/events` trả về đúng `eventType: "PERSONAL"` cho event đã tạo. |
| 3 | Lọc theo `type=PERSONAL` (query param `type`) hoạt động. |
| 4 | Event `PERSONAL` mặc định `visibility: PRIVATE`, **không** có participants. |
| 5 | Quyền: chủ sở hữu `canEdit`/`canDelete = true`; người khác không thấy (PRIVATE). |
| 6 | (tuỳ chọn) Migration: phân loại lại các event `OTHER` do FE tạo trong giai đoạn stopgap về `PERSONAL` nếu cần. |

### 4.2 Cập nhật phía FE sau khi backend xong

Sau khi backend thêm `PERSONAL`, FE cần:

- Bổ sung `"PERSONAL"` vào type `HRCalendarEventType` (`hrCalendarApi.ts`).
- Đổi `eventType: "OTHER"` → `"PERSONAL"` trong `handleCreatePersonalEvent`
  (`CalendarPage.tsx`).
- Khôi phục map `OTHER → "work"` và thêm `PERSONAL → "personal"` trong
  `mapApiEventTypeToLocal`; đổi `mapLocalTypeToApi("personal") → "PERSONAL"`.
- Cập nhật `APIcalendar.md` §2.3 (enum mới).

---

## 5. Tóm tắt

| Hạng mục | Trạng thái |
|---|---|
| Endpoint `POST /calendar/events` | ✅ Đã có |
| eventType `PERSONAL` | ❌ **Thiếu — cần backend bổ sung** |
| Stopgap FE (dùng `OTHER`) | ✅ Đã áp dụng, lịch cá nhân tạo/hiển thị được |
| Phân loại chính xác lịch cá nhân | ⏳ Chờ backend thêm `PERSONAL` |

---

## 6. Chi tiết công việc FE đã làm

### 6.1 Form lịch cá nhân (component mới)

**File mới: `src/components/ui/PersonalEventFormModal.tsx`**

- Form gọn hơn lịch họp, chỉ gồm: **Nội dung** (bắt buộc), **Ngày** (gõ
  `dd/mm/yyyy` hoặc chọn từ icon lịch — cùng kiểu form lịch họp), **Giờ bắt
  đầu / kết thúc** (24h, hiển thị thời lượng), **Ghi chú**, nút **Hủy / Lưu**.
- Màu theo `WEBFE.md`: focus ring xanh `#1976D2`, nút `variant="brand"`.
- Props: `isOpen`, `onClose`, `onBack?`, `onSave`, `defaultDate`,
  `defaultStartTime`, `defaultEndTime`, `initialData`, `isLoading`.
- Nút trái đổi nhãn theo ngữ cảnh: có `onBack` → **"Quay lại"**, không có →
  **"Hủy"**.

### 6.2 Bộ chọn loại lịch + nối vào các điểm "Thêm lịch"

**File sửa: `src/features/calendar/pages/CalendarPage.tsx`**

- Thêm **modal chọn loại lịch** với 2 thẻ:
  - **Lịch họp** (xanh, `UsersIcon`) → mở `MeetingFormModal`.
  - **Lịch cá nhân** (vàng amber, `UserIcon` — khớp màu filter "Cá nhân") → mở
    `PersonalEventFormModal`.
- Gắn bộ chọn (`openEventTypeChooser`) vào **cả hai** entry point:
  - Nút "Thêm lịch" ở sidebar.
  - Click ô khung giờ trên Day/Week View (`handleCreateAtSlot`) — vẫn giữ
    ngày/giờ điền sẵn rồi truyền vào form được chọn.
- Thêm `handleCreatePersonalEvent` lưu sự kiện qua `createEvent` (convert giờ
  local → UTC ISO như lịch họp).

### 6.3 Nút "Quay lại" về bộ chọn

- Thêm prop `onBack?` vào **cả** `MeetingFormModal` và `PersonalEventFormModal`.
- Khi mở từ luồng **tạo mới**: nút hiển thị **"Quay lại"** → đóng form và mở lại
  bộ chọn loại lịch (không thoát hẳn).
- Lưu thành công vẫn đóng bình thường; form **chỉnh sửa** lịch họp giữ nút
  **"Hủy"** (không truyền `onBack`).

### 6.4 Đồng bộ widget "Lịch tuần" ngoài màn chat

**File sửa: `src/components/ui/EmptyState.tsx`** (`WeeklyCalendarWidget` hiển thị
trên màn chat welcome — `NoChatSelected`).

Trước đó widget bấm "Thêm lịch" mở **thẳng** form họp; nay đồng bộ với
`CalendarPage`:

- Bấm "Thêm lịch" từng ngày → mở **bộ chọn loại lịch** (họp / cá nhân) thay vì
  mở thẳng form họp (`openEventTypeChooser`).
- Dùng chung `PersonalEventFormModal`; lưu qua `createEvent` với
  `eventType: "OTHER"` + `visibility: "PRIVATE"` (stopgap giống CalendarPage).
- Thêm `onBack` cho cả form họp (khi tạo mới) và form cá nhân → "Quay lại" mở
  lại bộ chọn; form **sửa** lịch họp vẫn giữ "Hủy".
- Sửa map hiển thị: event `OTHER` từ API → nhóm `"personal"` (legend "Cá nhân",
  màu amber) thay vì rơi vào `"work"` (không hiển thị).

### 6.5 Mapping eventType (stopgap)

Trong `CalendarPage.tsx`:

- `handleCreatePersonalEvent` gửi `eventType: "OTHER"` + `visibility: "PRIVATE"`.
- `mapApiEventTypeToLocal`: `OTHER → "personal"`.
- `mapLocalTypeToApi`: `personal → "OTHER"`.

### 6.6 Bảng file thay đổi

| File | Loại |
|------|------|
| `src/components/ui/PersonalEventFormModal.tsx` | Mới |
| `yeucauapicalenda.md` | Mới |
| `src/features/calendar/pages/CalendarPage.tsx` | Sửa |
| `src/components/ui/MeetingFormModal.tsx` | Sửa (thêm `onBack`) |
| `src/components/ui/EmptyState.tsx` | Sửa (đồng bộ widget "Lịch tuần") |

### 6.7 Lưu ý còn lại

- **Đánh đổi stopgap:** mọi event `OTHER` từ backend sẽ hiện dưới nhóm "Cá nhân"
  cho tới khi backend thêm enum `PERSONAL` (xem §3, §4).
- **Sửa lịch cá nhân** hiện vẫn mở form lịch họp (cả ở CalendarPage lẫn widget) —
  có thể tách nhánh để sửa bằng `PersonalEventFormModal` sau.
- Chưa chạy `npm run build` (theo quy ước `CLAUDE.md`); đã kiểm tra qua IDE
  diagnostics — không có lỗi type.
