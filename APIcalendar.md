# APIcalendar.md — Toàn bộ API liên quan đến Lịch (Calendar)

Tài liệu liệt kê **đầy đủ** mọi API mà tính năng Lịch trên `chat-web-client` đang gọi, các client/transport, envelope trả về, và luồng tiêu thụ. Đọc file này trước khi sửa bất cứ thứ gì liên quan tới lịch.

> Bổ trợ: `CLAUDE.md` (kiến trúc FE), `WEBAPI.md` (hợp đồng FE↔BE chat-api), `WEBBE.md` (backend chat-api). Riêng lịch/HR đi qua **hr-api-service** (service khác), nên hợp đồng chính nằm ở file này.

---

## 0. Tóm tắt nhanh

| Nhóm | File client | Transport | Base URL | Service |
|---|---|---|---|---|
| **Lịch (events)** | `features/api/hrCalendarApi.ts` | axios `hrApiClient` | `HR_API_BASE_URL` | hr-api-service |
| **Chấm công (attendance)** | `features/api/hrApi.ts` | axios `hrApiClient` | `HR_API_BASE_URL` | hr-api-service |
| **Hồ sơ HR (identity)** | `features/api/hrProfileApi.ts` | axios `hrApiClient` | `HR_API_BASE_URL` | hr-api-service |
| **Thông báo mời họp** | `features/api/hrNotificationApi.ts` | axios `hrApiClient` | `HR_API_BASE_URL` | hr-api-service |
| **Task hiện trên lịch** | `features/tasks/api/taskApi.ts` | axios riêng | `${API_BASE_URL}/tasks` | chat-api-service |
| **Tìm user để xem lịch** | `services/api.ts` `userApi.searchUsers` | `apiClient` | `API_BASE_URL` | chat-api-service |
| **Ngày lễ VN (tĩnh)** | `features/calendar/data/calendarEvents.ts` | — (hard-code) | — | — |

**Quan trọng:** Toàn bộ nhóm HR (lịch + chấm công + hồ sơ + thông báo) là **TÍNH NĂNG TÙY CHỌN (optional)**. Mọi lỗi (401/403/422/5xx/network) **không bao giờ** được đăng xuất hay làm hỏng phiên chat — chỉ degrade mềm tại widget lịch. Lý do & cơ chế xem mục 6.

---

## 1. Transport & Auth — `hrApiClient` (`features/api/hrApi.ts`)

```
axios.create({ baseURL: HR_API_BASE_URL, timeout: 30000, headers: { "Content-Type": "application/json" } })
```

**Request interceptor:**
- Đọc token tươi tại thời điểm gửi qua `getAccessToken()` (không cache header).
- Kiểm tra danh tính token khớp user hiện tại qua `compareIdentity(token, user)` (`services/authIdentityGuard.ts`).
- Nếu **mismatch** → reject ngay request đó bằng `AuthIdentityMismatchError` (chặn cục bộ), **KHÔNG** gọi `reportAuthIdentityMismatch()` (tránh logout toàn cục — đây từng là root cause của bug "HR 401 nuke cả phiên chat").
- Khớp → gắn `Authorization: Bearer <token>`.

**Response interceptor:**
- Nếu nhận HTML (`<!doctype html`) → reject `HR_API_HTML_RESPONSE` (sai `VITE_HR_API_BASE_URL`).
- 401/403 chỉ **log cảnh báo**, KHÔNG escalate auth lifecycle (chat/auth client mới sở hữu logout).

**Config (`config/index.ts`):**
```ts
export const HR_API_BASE_URL = resolveHttpBaseUrl(
  import.meta.env.VITE_HR_API_BASE_URL,
  import.meta.env.DEV ? "/hr-api" : "",   // dev proxy "/hr-api"; prod phải set env
);
```

**Envelope chuẩn hr-api:** `{ success: boolean, statusCode: number, data: <payload> }`. List được gateway chuẩn hóa thành `data: { items: [...], pagination: {...} }`.

---

## 2. Lịch sự kiện — `hrCalendarApi` (`features/api/hrCalendarApi.ts`)

Tất cả gọi qua `hrApiClient` → `HR_API_BASE_URL`.

| Hàm FE | HTTP | Mô tả |
|---|---|---|
| `listEvents(params)` | `GET /calendar/events` | Danh sách event (phân trang) |
| `getEvent(eventId)` | `GET /calendar/events/:eventId` | 1 event |
| `getEventPermissions(eventId)` | `GET /calendar/events/:eventId/permissions` | Quyền view/edit/delete |
| `createEvent(input)` | `POST /calendar/events` | Tạo event |
| `updateEvent(eventId, input)` | `PATCH /calendar/events/:eventId` | Sửa event |
| `deleteEvent(eventId)` | `DELETE /calendar/events/:eventId` | Xóa event |
| `updateMyResponse(eventId, response)` | `PATCH /calendar/events/:eventId/participants/me` | Người được mời trả lời (ACCEPTED/DECLINED/MAYBE/PENDING) |

> ⚠️ Lịch **đơn vị** (`/calendar/units/:unitId/*`) **chưa triển khai ở FE** — `calendarStore` mode `"unit"` chỉ hiện toast "đang phát triển".

### 2.1 `listEvents` — query params (`ListHREventsParams`)
| Param | Kiểu | Ghi chú |
|---|---|---|
| `ownerAuthUserId` | string | **Ưu tiên** — UUID auth-domain (externalAuthUserId từ JWT); backend tự resolve sang employee/HR user. |
| `ownerId` | string | **@deprecated** legacy fallback; chỉ append khi KHÔNG có `ownerAuthUserId`. **Không** truyền authUserUUID vào đây. |
| `from` / `to` | string (YYYY-MM-DD) | Khoảng thời gian (thường = đầu/cuối tháng đang xem). |
| `type` | string | Lọc theo `HRCalendarEventType`. |
| `visibility` | string | Lọc theo `HRCalendarVisibility`. |
| `includeParticipantEvents` | boolean | True khi xem lịch người khác (gồm cả event họ được mời). |
| `page` / `pageSize` | number | Phân trang (mặc định pageSize 50). |

**Trả về `HRCalendarEventsResponse`:**
```ts
{
  mode?: 'HR_LINKED' | 'NO_HR_PROFILE',   // NO_HR_PROFILE (200) = user chưa liên kết hồ sơ NS → grid trống + notice mềm
  data: HRCalendarEvent[],
  pagination: { page, pageSize, totalItems, totalPages, hasNextPage, hasPrevPage },
  capabilities?: { canCreatePersonalEvent, canViewHrEvents, canViewDepartmentEvents, canRetryHrLink },
  warnings?: Array<{ code, message }>,
}
```

### 2.2 `createEvent` / `updateEvent` — body
```ts
{
  title, description?, startAt, endAt,        // startAt/endAt là ISO UTC (xem mục 7 — convert local→UTC)
  eventType?, visibility?, isAllDay?, location?, timezone?,
  participantIds?: string[],                  // ref backend resolve được: employee cuid / employeeCode / authUserId
  attendees?: string[],                       // tên free-text (không resolve được) → lưu vào metadata.attendees
  meetingChairman?, meetingFormat?,           // meeting extras → metadata
}
```
- **create**: bỏ qua field rỗng (truyền `undefined`).
- **update**: gửi cả chuỗi rỗng `""` để **xóa** ghi chú/địa điểm cũ (backend chỉ bỏ qua khi `undefined`); `participantIds` là full set mong muốn — server reconcile (thêm người mới tag, gỡ người bỏ tag).

### 2.3 Kiểu dữ liệu chính `HRCalendarEvent`
- enums: `eventType` ∈ MEETING|TASK|LEAVE|DEADLINE|REMINDER|OTHER|PERSONAL; `visibility` ∈ PRIVATE|BUSY_ONLY|TEAM|UNIT|PUBLIC.
- `participants: HRCalendarParticipant[]` mỗi người có `response` ∈ PENDING|ACCEPTED|DECLINED|MAYBE, kèm `employeeId/authUserId/employeeCode/fullName/departmentName`.
- `metadata?: { meetingChairman?, meetingFormat?, attendees?: string[] }` — null khi `BUSY_ONLY` bị mask.
- cờ quyền: `canEdit`, `canDelete`, `canViewFullDetails`, `isParticipant`.

#### `PERSONAL` — lịch cá nhân
- Dùng cho lịch cá nhân của một user (vd: khám sức khỏe, việc riêng).
- Mặc định `visibility = PRIVATE` nếu FE không truyền `visibility`.
- **Không có participants** — gửi `participantIds`/`participants` cho event `PERSONAL` sẽ bị backend từ chối **422** với message `PERSONAL events cannot have participants`.
- Chỉ owner nhìn thấy (PRIVATE) — không xuất hiện trong lịch người khác / phòng ban / công ty.
- Owner luôn có `canEdit = true`, `canDelete = true`.
- Không gửi notification/invitation (vì không có participants).
- Lọc theo loại: `GET /calendar/events?type=PERSONAL` chỉ trả event `PERSONAL` (filter `type`/`visibility` được áp ở backend).
- **Alias `type`**: `createEvent` chấp nhận cả `eventType` và alias `type`. Nếu truyền cả hai mà **khác nhau** → **400** (`Conflicting event type`). Giống nhau hoặc chỉ một field → OK.

> **Lưu ý `capabilities` / `mode`**: các field `mode` và `capabilities` (gồm `canCreatePersonalEvent`) ở response §2.1 là **optional** và hiện do FE xử lý graceful-fallback; endpoint `GET /calendar/events` của hr-api-service hiện **chưa phát ra** chúng (trả `{ data, pagination }`). FE coi vắng mặt = `HR_LINKED` và luôn cho phép tạo lịch cá nhân. Không dựa vào `canCreatePersonalEvent` như một cờ bắt buộc từ backend cho tới khi endpoint capability được triển khai.

---

## 3. Chấm công — `hrApi` (`features/api/hrApi.ts`)

| Hàm FE | HTTP | Mô tả |
|---|---|---|
| `getMyAttendanceCalendar({from, to})` | `GET /attendance/calendar/me?from&to` | Bảng chấm công theo tháng (badge giờ đến/về trên ô lịch) |
| `getMyAttendanceDay(date)` | `GET /attendance/calendar/me/:date` | Chi tiết 1 ngày |
| `healthCheck()` | `GET /health` | Kiểm tra HR API sống (timeout 5s) |
| `checkAttendanceAccess()` | (helper) | Gọi `getMyAttendanceCalendar` range giả để dò quyền + lấy employeeId |

- `AttendanceCalendarResponse = { items: AttendanceCalendarDay[], reason?, message? }`.
- `reason` đặc biệt FE xử lý: `EMPLOYEE_NOT_LINKED`, `NO_ATTENDANCE_DATA`.
- `AttendanceCalendarDay`: `firstPunch/lastPunch/totalMinutes/classificationStatus(PASS|WARNING|REVIEW_REQUIRED|ESCALATED)/classificationColor(green|yellow|orange|red)/exceptionStatus/...`.

---

## 4. Hồ sơ HR (identity cho lịch) — `hrProfileApi` (`features/api/hrProfileApi.ts`)

| Hàm FE | HTTP | Mô tả |
|---|---|---|
| `getMyHrProfile({signal?})` | `GET /auth/me` | Hồ sơ NS chuẩn (chức vụ/phòng ban/employeeCode/authUserId…) |

- Route `/auth/me` chỉ cần Bearer hợp lệ (không cần quyền HR).
- Trả `null` khi không có hồ sơ NS hoặc lỗi (graceful) → caller fallback hồ sơ chat-api.
- **Hook tiêu thụ:** `hooks/useMyHrProfile.ts` — cache module-level, refetch on focus/online/visibility + polling 60s (chỉ khi tab visible). `employeeCode`/`authUserId` ở đây là nguồn để map người tham gia/chủ trì khi tạo lịch.

---

## 5. Thông báo mời họp — `hrNotificationApi` (`features/api/hrNotificationApi.ts`)

| Hàm FE | HTTP | Mô tả |
|---|---|---|
| `list({page, pageSize, unreadOnly})` | `GET /notifications?page&pageSize&unreadOnly` | Danh sách thông báo (mời/phản hồi họp) |
| `unreadCount()` | `GET /notifications/unread-count` | Số chưa đọc (badge chuông) |
| `markRead(id)` | `PATCH /notifications/:id/read` | Đánh dấu 1 đã đọc |
| `markAllRead()` | `PATCH /notifications/read-all` | Đánh dấu tất cả đã đọc |

- **Component tiêu thụ:** `features/calendar/components/HrNotificationBell.tsx` — **polling 30s** (`POLL_MS = 30_000`), **không có WebSocket realtime** cho lịch.
- `HrAppNotification.entityType === "CALENDAR_EVENT"` → click điều hướng `/calendar?eventId=<id>` (hoặc `payload.actionUrl` nếu có).

---

## 6. Task hiển thị trên lịch — `taskApi` (`features/tasks/api/taskApi.ts`)

| Hàm FE | HTTP | Mô tả |
|---|---|---|
| `getCalendarTasks(from, to)` | `GET /tasks/calendar?from&to` | Task có `dueDate` trong khoảng → badge "task" trên ô lịch |

- Transport: axios riêng, base `${API_BASE_URL}/tasks` (**chat-api-service**, KHÔNG phải hr-api).
- Click task trên lịch → điều hướng `/tasks?taskId=<id>` (không mở modal lịch).

---

## 7. Tìm user để xem lịch người khác — `userApi.searchUsers`

- `services/api.ts` → `userApi.searchUsers(query, page, limit)` (chat-api `apiClient`).
- Dùng trong `components/ui/UserSearchModal.tsx`: chọn user → `calendarStore.setViewingUser(userId, userName)` → `listEvents({ ownerAuthUserId: userId, includeParticipantEvents: true })`.

---

## 8. Luồng tiêu thụ & quy ước

**Store điều phối:** `stores/calendarStore.ts` (zustand) bọc `hrCalendarApi`:
- `fetchEvents(from, to)` theo `mode`: `"my"` (lịch mình) / `"other"` (`ownerAuthUserId`) / `"unit"` (chưa làm).
- `createEvent` / `updateEvent` / `deleteEvent` (kèm toast + cập nhật mảng `events`).
- State lỗi mềm: `calendarUnavailable`, `errorCode` ∈ EMPLOYEE_LINK_REQUIRED|EMPLOYEE_INACTIVE|FORBIDDEN|UNAVAILABLE|NOT_FOUND|NETWORK_ERROR|UNKNOWN_ERROR.

**Trang:** `features/calendar/pages/CalendarPage.tsx` gộp 4 nguồn lên grid:
1. events HR (`calendarStore` → `hrCalendarApi`)
2. chấm công (`hrApi.getMyAttendanceCalendar`)
3. task (`taskApi.getCalendarTasks`)
4. ngày lễ VN tĩnh (`features/calendar/data/calendarEvents.ts`)

**Form:** `components/ui/MeetingFormModal.tsx` — tag người tham gia/chủ trì từ `friendshipStore` (mang theo `employeeCode`/`userId`); `buildParticipantPayload()` trong CalendarPage tách `refs` (resolve được) vs `freeTextNames` (→ `attendees`).

**Quy ước thời gian (CỰC KỲ QUAN TRỌNG):**
- Date+time người dùng nhập là **giờ địa phương** → convert sang **UTC ISO** bằng `new Date("YYYY-MM-DDTHH:mm:00").toISOString()`. **TUYỆT ĐỐI KHÔNG** nối `"Z"` thẳng (lệch 7h ở VN).
- Khi render: ISO (UTC) → local qua `toLocalTimeString` / `toLocalDateString` (dùng `Date.getHours()`, **không** slice chuỗi).

**Optional-feature contract:** HR (lịch/chấm công/hồ sơ/thông báo) lỗi → degrade mềm, không logout, không toast "phiên hết hạn". Auth lifecycle do chat/auth client sở hữu.

---

## 9. Bảng tổng hợp endpoint (copy nhanh)

```
# hr-api-service (HR_API_BASE_URL) — axios hrApiClient (Bearer + identity guard, optional)
GET    /calendar/events?ownerAuthUserId&ownerId&from&to&type&visibility&includeParticipantEvents&page&pageSize
GET    /calendar/events/:eventId
GET    /calendar/events/:eventId/permissions
POST   /calendar/events
PATCH  /calendar/events/:eventId
DELETE /calendar/events/:eventId
PATCH  /calendar/events/:eventId/participants/me
GET    /attendance/calendar/me?from&to
GET    /attendance/calendar/me/:date
GET    /auth/me
GET    /notifications?page&pageSize&unreadOnly
GET    /notifications/unread-count
PATCH  /notifications/:id/read
PATCH  /notifications/read-all
GET    /health

# chat-api-service (API_BASE_URL)
GET    /tasks/calendar?from&to        # taskApi.getCalendarTasks
GET    /users/search (userApi.searchUsers — chọn user để xem lịch)
```
