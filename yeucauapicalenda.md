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

## 2. Vấn đề — thiếu enum `PERSONAL`

Enum `eventType` hiện tại của `hr-api-service` (xem `APIcalendar.md` §2.3):

```
MEETING | TASK | LEAVE | DEADLINE | REMINDER | OTHER
```

➡️ **Không có giá trị `PERSONAL`.** Gửi `eventType: "PERSONAL"` → backend trả
lỗi validation (422) → FE báo "Không thể tạo sự kiện". Đây là lý do lịch cá
nhân **chưa tạo được**.

Ghi chú: response `listEvents` đã có capability `canCreatePersonalEvent`
(`APIcalendar.md` §2.1) — tức backend đã có khái niệm "lịch cá nhân", nhưng
**chưa có eventType riêng** để phân loại.

## 3. Giải pháp tạm thời đang áp dụng ở FE (stopgap)

Để không chặn người dùng, FE tạm thời:

- Gửi `eventType: "OTHER"` + `visibility: "PRIVATE"` cho lịch cá nhân.
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
