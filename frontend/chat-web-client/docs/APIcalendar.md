# APIcalendar.md — Toàn bộ API phần Lịch (Calendar)

> **Nguồn sự thật:** code thật của `hr-api-service` (`src/modules/calendar`, `src/modules/notifications`, `src/modules/attendance`) + client FE (`src/features/api/hr*.ts`). File này gom **mọi endpoint, DTO, envelope, quyền, edge-case** liên quan đến lịch, để AI/Dev không cần đọc lại source.
>
> Cập nhật khi contract đổi. Contract xuyên repo nằm ở `d:\HacomCTY\chat-api-service\docs\requests\` (xem mục 10).

---

## 0. Tổng quan kiến trúc

Lịch trên chat-web-client **không** đi qua `chat-api-service`. Toàn bộ đi thẳng tới **`hr-api-service`** bằng cùng Bearer token (JWT auth-service).

```
CalendarPage / WeeklyCalendarWidget / HrNotificationBell
   │
   ├─ hrCalendarApi   (features/api/hrCalendarApi.ts)  → /calendar/events*        (CRUD lịch + participants)
   ├─ hrApi           (features/api/hrApi.ts)          → /attendance/calendar/me* (chấm công)
   ├─ hrProfileApi    (features/api/hrProfileApi.ts)   → /auth/me                 (identity cho lịch)
   └─ hrNotificationApi (features/api/hrNotificationApi.ts) → /notifications*     (mời họp / phản hồi)
          │
          └─ hrApiClient (axios, features/api/hrApi.ts) — baseURL = HR_API_BASE_URL
```

CalendarPage gộp **4 nguồn** thành 1 lịch: (1) HR calendar events, (2) chấm công, (3) task, (4) ngày lễ tĩnh (`calendarEvents.ts`).

### Base URL & prefix

| Env | `VITE_HR_API_BASE_URL` |
|---|---|
| Dev | `/hr-api/v1` (proxy Vite) |
| Prod | `https://hrm.hacomholdings.com.vn/api/v1` |

- Config: [src/config/index.ts:213](../src/config/index.ts#L213) → `HR_API_BASE_URL` (dev fallback `/hr-api`, prod fallback `""`).
- BE global prefix: `api/v1` (`hr-api-service` `bootstrap.ts:82`, `setGlobalPrefix(apiPrefix)`), có middleware tự viết lại `/api/*` ↔ `/api/v1/*` để tương thích 2 chiều. **Vậy path đầy đủ = `{HR_API_BASE_URL}` + route dưới đây** (route đã bỏ prefix).

### Client transport — `hrApiClient` ([features/api/hrApi.ts:22](../src/features/api/hrApi.ts#L22))

- **Request interceptor:** đọc access token tại lúc gửi (không cache header) + `compareIdentity()`. Nếu token không khớp user hiện tại → **reject riêng request này**, KHÔNG logout (`AuthIdentityMismatchError`). Nếu không có token → gửi không Authorization.
- **Response interceptor (optional-feature contract):**
  - Nếu server trả HTML (`<!doctype html`) → reject `HR_API_HTML_RESPONSE` (sai `VITE_HR_API_BASE_URL`).
  - **401/403 chỉ log, KHÔNG logout** — HRM/lịch là tính năng optional; chat/auth client mới sở hữu vòng đời auth. Đây là gốc rễ đã fix việc "1 lỗi 401 lịch làm rớt cả phiên chat".
- `timeout` 30s. `Content-Type: application/json`.

### Envelope response chuẩn (BE `ResponseEnvelopeInterceptor`)

Mọi response bọc: `{ success: true, statusCode, message, data, requestId }`.

- **Item** (`buildItemResponse`): `data` = object.
- **List** (`buildListResponse` / legacy `{data:[], pagination}`): interceptor **chuẩn hóa** thành `data = { items: T[], pagination }` (đổi `data[]` → `items[]`). ⚠️ FE phải đọc `body.data.items`, KHÔNG phải `body.data`.
- Một số handler (list calendar, list notifications) trả thẳng `{ data, pagination }` → interceptor bọc lại thành `{ success, data: { items, pagination } }`.

---

## 1. Enums (đồng bộ Prisma ↔ FE)

| Enum | Giá trị | FE type |
|---|---|---|
| `CalendarEventType` | `MEETING` `TASK` `LEAVE` `DEADLINE` `REMINDER` `OTHER` `PERSONAL` | `HRCalendarEventType` |
| `CalendarVisibility` | `PRIVATE` `BUSY_ONLY` `TEAM` `UNIT` `PUBLIC` | `HRCalendarVisibility` |
| `ParticipantResponse` | `PENDING` `ACCEPTED` `DECLINED` `MAYBE` | `HRParticipantResponse` |

- FE map eventType → bucket hiển thị (`meeting/personal/attendance/task`, còn lại → `personal`): [calendarEventMapping.ts:39](../src/features/calendar/utils/calendarEventMapping.ts#L39).
- Thời gian: API trả **ISO UTC**. FE **luôn** convert sang local qua `toLocalTimeString` / `toLocalDateString` (KHÔNG `slice` chuỗi → lệch 7h): [calendarEventMapping.ts:17](../src/features/calendar/utils/calendarEventMapping.ts#L17).

---

## 2. `hrCalendarApi` — Lịch (events + participants)

Client: [src/features/api/hrCalendarApi.ts](../src/features/api/hrCalendarApi.ts). Controller BE: `calendar.controller.ts`. Service BE: `calendar.service.ts`.

### 2.1 Bảng endpoint

| # | Method | Route (sau prefix) | Client fn | Guard/Quyền |
|---|---|---|---|---|
| 1 | GET | `/calendar/events` | `listEvents(params)` | Bearer; ai cũng list được (owner OR conditions) |
| 2 | GET | `/calendar/events/:id` | `getEvent(id)` | Bearer + `canView` (404 nếu thiếu quyền → thực ra 403 Forbidden) |
| 3 | GET | `/calendar/events/:id/permissions` | `getEventPermissions(id)` | Bearer |
| 4 | POST | `/calendar/events` | `createEvent(input)` | Bearer; lịch HR-scope cần liên kết employee |
| 5 | PATCH | `/calendar/events/:id` | `updateEvent(id, input)` | Bearer + `canEdit` (chỉ owner) |
| 6 | DELETE | `/calendar/events/:id` | `deleteEvent(id)` | Bearer + `canDelete` (chỉ owner) |
| 7 | POST | `/calendar/events/:id/participants` | *(chưa dùng ở FE)* | Bearer + `canEdit` |
| 8 | DELETE | `/calendar/events/:id/participants/:employeeId` | *(chưa dùng ở FE)* | Bearer + `canEdit` |
| 9 | PATCH | `/calendar/events/:id/participants/me` | `updateMyResponse(id, response)` | Bearer + là participant + có employee link |

> ⚠️ Endpoint 7/8 **có ở BE nhưng client FE chưa expose** (`hrCalendarApi` chỉ có `updateMyResponse`). Muốn add/remove participant lẻ phải thêm hàm client; hiện FE reconcile cả set qua `participantIds` trong `updateEvent`.

---

### 2.2 GET `/calendar/events` — list

**Query params** (`ListCalendarEventsDto` extends `PaginationDto`):

| Param | Kiểu | Ghi chú |
|---|---|---|
| `ownerAuthUserId` | string | **Ưu tiên** — auth UUID (externalAuthUserId / JWT sub). BE tự resolve về employee/user đúng. |
| `ownerId` | string | *(deprecated)* legacy — BE auto-detect authUserId/employeeId/userId cuid. Chỉ append khi KHÔNG có `ownerAuthUserId`. |
| `employeeCode` | string | fallback resolution (mã nhân sự). |
| `from` / `to` | ISO date | lọc theo `startAt gte/lte`. |
| `type` | `CalendarEventType` | lọc theo cột `eventType`. |
| `visibility` | `CalendarVisibility` | normalize uppercase; sai → 400. |
| `includeParticipantEvents` | boolean | "true"/"false". Với lịch của chính mình luôn bật ngầm. |
| `page` | int ≥1 (default 1) | |
| `pageSize` | int 1..100 (default 20) | Client FE mặc định coi `pageSize=50` khi parse thiếu. |

> **Owner precedence (BE `resolveTargetOwner`):** không param → lịch của chính user. Có param & khớp user hiện tại (qua bất kỳ identity) → coi như của mình. Khác → resolve target + **áp quyền xem** (chỉ thấy event không PRIVATE, hoặc mình là participant).
> **Đừng** truyền `ownerId` = auth UUID → dùng `ownerAuthUserId`. Client FE tự enforce điều này ([hrCalendarApi.ts:155](../src/features/api/hrCalendarApi.ts#L155)).

**Response** (sau interceptor): `{ success, data: { items: HRCalendarEvent[], pagination } }`.

Client trả về `HRCalendarEventsResponse`:
```ts
{
  mode?: 'HR_LINKED' | 'NO_HR_PROFILE',
  data: HRCalendarEvent[],
  pagination: { page, pageSize, totalItems, totalPages, hasNextPage, hasPrevPage },
  capabilities?: { canCreatePersonalEvent, canViewHrEvents, canViewDepartmentEvents, canRetryHrLink },
  warnings?: { code, message }[],
}
```
- ⚠️ Client map `pagination.total` (BE) → `totalItems` (FE), `hasPreviousPage` → `hasPrevPage`.
- **`mode: 'NO_HR_PROFILE'`**: khi user chưa liên kết hồ sơ nhân sự, BE có thể trả graceful fallback (`data: []`, kèm `capabilities`/`warnings`). Absent = coi như `HR_LINKED`.

**Masking (privacy) trong list:** event của **người khác** ở visibility `PRIVATE` bị mask (`title:'Busy'`, `description/location/metadata:null`, `participants:[]`, `canViewFullDetails:false`). Chỉ lịch của chính mình không mask. FE đổi title `'Busy'` → `'Bận'` ([calendarEventMapping.ts:65](../src/features/calendar/utils/calendarEventMapping.ts#L65)).

---

### 2.3 `HRCalendarEvent` — shape đầy đủ (response item)

```ts
interface HRCalendarEvent {
  id: string;
  title: string;                 // 'Busy' nếu bị mask
  description: string | null;
  ownerId: string;               // employeeId ?? ownerUserId ?? ownerAuthUserId
  ownerAuthUserId?: string | null;
  ownerEmployeeCode?: string | null;
  ownerName?: string | null;     // = owner.fullName
  owner: { id, fullName, employeeCode } | null;
  startAt: string;               // ISO UTC
  endAt: string;                 // ISO UTC
  timezone: string;              // default 'Asia/Ho_Chi_Minh'
  isAllDay: boolean;
  isRecurring: boolean;
  recurrenceRule: string | null;
  visibility: HRCalendarVisibility;
  eventType: HRCalendarEventType;
  location: string | null;
  metadata?: Record<string, unknown> | null;   // meeting extras — xem 2.4; null khi masked
  participants: HRCalendarParticipant[];        // [] khi masked
  canEdit: boolean;              // = isOwner
  canDelete: boolean;            // = isOwner
  canViewFullDetails: boolean;
  isParticipant: boolean;
  createdAt: string;
  updatedAt: string;
}

interface HRCalendarParticipant {
  id: string;
  employeeId: string;
  authUserId?: string | null;
  employeeCode?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;     // ⚠️ BE hiện luôn trả null (mapParticipant) — FE batch-load avatar riêng từ chat-web
  departmentName?: string | null;// từ employeeAssignment ACTIVE primary
  employee: { id, fullName, employeeCode } | null;
  response: HRParticipantResponse;
  respondedAt?: string | null;
  createdAt: string;
}
```

> **Avatar:** `participant.avatarUrl` và `owner.avatarUrl` BE **chưa trả** (`mapParticipant` set `avatarUrl:null`, owner select không có avatar). FE build avatar stack = owner + participants (dedup theo tên), rồi **batch-load avatar theo `authUserId` từ chat-web** như cơ chế Poll: [calendarEventMapping.ts:89](../src/features/calendar/utils/calendarEventMapping.ts#L89). Xem contract `FE__calendar-participant-avatar__contract__29-06-26.md` (Done).

---

### 2.4 `metadata` — meeting extras

Các field họp KHÔNG phải cột riêng — lưu trong JSON `metadata`:

| Key | Nguồn (create/update DTO) | Ghi chú |
|---|---|---|
| `meetingChairman` | `meetingChairman` | chủ trì (free-text tên) |
| `meetingFormat` | `meetingFormat` | `offline` / `online` / `hybrid` |
| `attendees` | `attendees: string[]` | tên người dự dạng free-text (KHÔNG resolve thành participant) |
| `source` | `source` | `MANUAL` / `MEETING` / `ATTENDANCE`… (create only) |
| `status` | `status` | `CONFIRMED` / `TENTATIVE` / `CANCELLED` |

- Create: chỉ set key khi field !== undefined; `metadata` để `undefined` nếu rỗng.
- Update: **merge** vào metadata cũ (không ghi đè toàn bộ). `hasMetadataUpdate` = có bất kỳ status/attendees/meetingChairman/meetingFormat.
- `metadata = null` khi event bị mask (không đủ quyền).

---

### 2.5 POST `/calendar/events` — create

Client `createEvent(input)` gửi body:
```ts
{
  title: string;                 // BẮT BUỘC, max 255
  description?: string;
  startAt: string;               // BẮT BUỘC ISO
  endAt: string;                 // BẮT BUỘC ISO, phải ≥ startAt (400 nếu <)
  eventType?: HRCalendarEventType;   // (BE cũng nhận alias `type`; nếu cả 2 khác nhau → 400)
  visibility?: HRCalendarVisibility; // default PRIVATE
  isAllDay?: boolean;            // default false
  location?: string;
  timezone?: string;             // default 'Asia/Ho_Chi_Minh'
  participantIds?: string[];     // employee cuid / employeeCode / authUserId — BE resolve; unresolvable → drop
  attendees?: string[];          // free-text → metadata
  meetingChairman?: string;      // → metadata
  meetingFormat?: string;        // → metadata
}
```

**Field BE nhận thêm nhưng client FE hiện chưa gửi:** `type` (alias eventType), `isPublic` (legacy visibility, nếu vừa gửi `visibility` vừa `isPublic` mà mâu thuẫn → 400), `isRecurring`, `recurrenceRule`, `source`, `status`, `departmentId`/`orgUnitId`/`companyId` (UUID v4 — HR-scope).

**Quy tắc BE quan trọng:**
- **PERSONAL event KHÔNG được có participants** → 422 `PERSONAL events cannot have participants`.
- Không được thêm chính owner làm participant → 400 `Cannot add owner as participant`.
- **HR-scoped create** (có `departmentId`/`orgUnitId`/`companyId`, HOẶC có participants khác owner) mà tài khoản **chưa liên kết employee** → 422 `EMPLOYEE_LINK_REQUIRED`.
- Owner lưu **cả 4 identity** (ownerId/ownerUserId/ownerAuthUserId/ownerEmployeeCode) để query cũ/mới đều khớp. Owner **không** tự thêm vào `participants`.
- Sau create: **fan-out notification** `calendar.meeting.invited` cho mọi participant (trừ actor).

**Response:** `{ data: HRCalendarEvent }` (event vừa tạo, enriched).

---

### 2.6 PATCH `/calendar/events/:id` — update

Client `updateEvent(id, input)`. Body tương tự create nhưng tất cả optional. Điểm khác:

- `participantIds?: string[]` = **desired full set** → BE `reconcileParticipants`: add mới / keep / remove những cái bị bỏ. Owner không bao giờ bị add. Bỏ field = không đụng participants.
- `startAt`+`endAt` cùng gửi & `endAt < startAt` → 400.
- meeting metadata (`status/attendees/meetingChairman/meetingFormat`) → **merge**.
- Chỉ **owner** update được (`canEdit`), else 403.
- Notifications best-effort: invite người mới (`meeting.invited`), báo người bị gỡ (`meeting.cancelled`), và nếu **nội dung đổi** (title/startAt/endAt/location/description) thì ping roster còn lại (`meeting.updated`).

**Response:** `{ data: HRCalendarEvent }`.

---

### 2.7 DELETE `/calendar/events/:id`

- Chỉ owner (`canDelete`), else 403. Không tồn tại → 404.
- Soft/hard delete + audit + notify roster `calendar.meeting.cancelled`.
- Client trả `void`. BE trả `{ data: { success: true } }`.

---

### 2.8 GET `/calendar/events/:id/permissions`

Client `getEventPermissions(id)` → `HRCalendarPermission`:
```ts
{ canView, canEdit, canDelete, canViewFullDetails, reason? }
```

**Ma trận quyền (BE `getEventPermissions`):**

| Điều kiện | canView | canViewFullDetails | canEdit/canDelete |
|---|---|---|---|
| Là owner | ✅ | ✅ | ✅ |
| Là participant | ✅ | ✅ | ❌ |
| `PUBLIC` | ✅ | ✅ | ❌ |
| `BUSY_ONLY` | chỉ khi có quyền xem-người-khác¹ | ❌ (mask) | ❌ |
| `UNIT` | cùng unit **và** ¹ | = canView | ❌ |
| `TEAM` | cùng department **và** ¹ | = canView | ❌ |
| `PRIVATE` (người khác) | ❌ | ❌ | ❌ |

¹ `canUserViewOthersCalendar` = SuperAdmin ∨ HR ∨ Leadership ∨ `canViewAllEmployees`.

---

### 2.9 PATCH `/calendar/events/:id/participants/me` — phản hồi lời mời

Client `updateMyResponse(id, response)`. Body: `{ response: 'PENDING'|'ACCEPTED'|'DECLINED'|'MAYBE' }`.

- Cần tài khoản có **employee link** → else 422 `EMPLOYEE_LINK_REQUIRED`.
- Event không tồn tại / đã xóa → 404. Không phải participant → 404 `You are not a participant in this event`.
- Set `response` + `respondedAt=now`, audit, và **notify organizer** `calendar.meeting.participant_responded` (payload có `actionUrl: /calendar?eventId=...`).
- Client trả `void`. BE trả `{ data: <participant đã update> }`.

---

### 2.10 POST/DELETE participants lẻ (BE có, FE chưa gọi)

- `POST /calendar/events/:id/participants` — body `AddParticipantDto { employeeId: string (cuid), response? }`. Cần `canEdit`. Trùng → 400 `Participant already exists`. Trả participant (kèm `employee`).
- `DELETE /calendar/events/:id/participants/:employeeId` — cần `canEdit`. Không có → 404 `Participant not found`. Trả `{ success: true }`.

---

## 3. `hrApi` — Chấm công (attendance calendar)

Client: [src/features/api/hrApi.ts:165](../src/features/api/hrApi.ts#L165). Controller BE: `attendance-calendar.controller.ts` (`@Controller('attendance/calendar')`, `AuthProviderGuard`).

| Method | Route | Client fn | Quyền |
|---|---|---|---|
| GET | `/attendance/calendar/me?from&to` | `getMyAttendanceCalendar({from,to})` | Bearer (bản thân) |
| GET | `/attendance/calendar/me/:date` | `getMyAttendanceDay(date)` | Bearer (bản thân) |
| GET | `/attendance/calendar?employeeId&from&to` | *(FE không dùng)* | `ATTENDANCE_READ` |
| GET | `/attendance/calendar/:employeeId?from&to` | *(FE không dùng)* | `ATTENDANCE_READ` |
| GET | `/attendance/calendar/:employeeId/:date` | *(FE không dùng)* | `ATTENDANCE_READ` |

### 3.1 GET `/attendance/calendar/me`
- Query `from`/`to` = `YYYY-MM-DD`.
- **Không có employee link** → 200 `{ items: [], reason: 'EMPLOYEE_NOT_LINKED', message }`.
- **Không có dữ liệu** → 200 `{ items: [], reason: 'NO_ATTENDANCE_DATA', message }`.
- Client unwrap envelope `{success,data}` → `AttendanceCalendarResponse { items, reason?, message? }`.

**`AttendanceCalendarDay`** (item): `date, employeeId?, employeeCode?, fullName?, firstPunch?, lastPunch?, totalTime?, totalMinutes?, classificationStatus?(PASS|WARNING|REVIEW_REQUIRED|ESCALATED), classificationColor?(green|yellow|orange|red), classificationLabel?, classificationReasons?[], exceptionStatus?, exceptionReason?, requiresAction, status?, mappingStatus?`.

### 3.2 GET `/attendance/calendar/me/:date`
- `:date` = `YYYY-MM-DD`. Không link / không có record → `null`.
- Trả `AttendanceCalendarDay` (BE `CalendarDayDetailDto` có thêm `deptName, rawPayload, mappingConfidence, mappingReason, classifiedAt, exceptionAssigneeId, exceptionUpdatedAt, severityScore` — FE hiện chưa map các field detail này).

### 3.3 Tiện ích
- `hrApi.healthCheck()` → GET `/health` (timeout 5s) → boolean.
- `checkAttendanceAccess()` → probe `me` với khoảng `2000-01-01` để biết có employeeId không.

---

## 4. `hrProfileApi` — Identity cho lịch

Client: [src/features/api/hrProfileApi.ts](../src/features/api/hrProfileApi.ts). Dùng để lấy `authUserId` / `employeeCode` phục vụ filter lịch (owner precedence) + hiển thị hồ sơ.

| Method | Route | Client fn |
|---|---|---|
| GET | `/auth/me` | `getMyHrProfile({signal?})` |

- Chỉ cần Bearer (không cần quyền HR).
- Trả `HrMeProfile | null` (null khi chat-only account hoặc bất kỳ lỗi HR — optional, không được vỡ màn hình).
- `HrMeProfile`: `{ userId, authUserId, email, username, fullName, accountStatus, employeeId, employee: HrEmployee | null }`.
- `HrEmployee`: employeeCode, fullName, email/companyEmail/personalEmail, phone, gender, dateOfBirth, dateOfJoining, citizenIdMasked, status, employmentStatus, unit/department/position/businessSector (HrOrgRef).
- FE wrapper: hook `useMyHrProfile` (REST poll ~60s). Xem memory `project_hr_profile_source`.

---

## 5. `hrNotificationApi` — Thông báo mời họp / phản hồi

Client: [src/features/api/hrNotificationApi.ts](../src/features/api/hrNotificationApi.ts). Controller BE: `notification.controller.ts` (`@Controller('notifications')`). UI: `HrNotificationBell.tsx`.

| Method | Route | Client fn | Trả |
|---|---|---|---|
| GET | `/notifications?page&pageSize&unreadOnly` | `list(params)` | `HrAppNotification[]` (đọc `data.items`) |
| GET | `/notifications/unread-count` | `unreadCount()` | `number` (đọc `data.count`) |
| PATCH | `/notifications/:id/read` | `markRead(id)` | void |
| PATCH | `/notifications/read-all` | `markAllRead()` | void |

- Params list: `page`(default 1), `pageSize`(default 20), `unreadOnly?`.
- **Tất cả lỗi degrade im lặng** = "không có thông báo", không logout.

**`HrAppNotification`**: `{ id, type, title, body|null, actorName|null, entityType|null, entityId|null, payload|null, readAt|null, createdAt }`.

### 5.1 Các `type` notification do calendar service phát

| type | Khi nào | Người nhận |
|---|---|---|
| `calendar.meeting.invited` | create / update thêm participant | participant mới |
| `calendar.meeting.updated` | update đổi nội dung (title/time/location/desc) | roster còn lại |
| `calendar.meeting.cancelled` | delete event / gỡ participant | roster / người bị gỡ |
| `calendar.meeting.participant_responded` | participant đổi response | organizer (owner) |

**payload chung (meeting):** `{ eventId, startAt, endAt, ownerAuthUserId, ownerName, actionUrl: '/calendar?eventId=...' }`.
**payload participant_responded:** `{ eventId, response, respondedAt, actionUrl }`.

> FE điều hướng: `actionUrl` dạng `/calendar?eventId=<id>` — mở CalendarPage và nhảy tới chi tiết event.

---

## 6. Edge-cases & lưu ý FE (bắt buộc nhớ)

1. **Timezone:** API ISO UTC → luôn convert local (`toLocalTimeString/DateString`). Đừng `.slice(0,10)` chuỗi ISO cho giờ.
2. **Masking:** event người khác PRIVATE → `title:'Busy'`(→'Bận'), field nhạy cảm null, `participants:[]`. Kiểm `canViewFullDetails` trước khi render chi tiết.
3. **Avatar owner/participant:** BE trả null → FE tự batch-load theo `authUserId`. Đừng phụ thuộc `avatarUrl` từ HR.
4. **Owner filter:** dùng `ownerAuthUserId` (UUID), không nhét UUID vào `ownerId`.
5. **PERSONAL ≠ participants:** form lịch cá nhân không được gửi participantIds (422).
6. **`mode: NO_HR_PROFILE`:** xử lý graceful (hiện empty + soft notice), đọc `capabilities`/`warnings`.
7. **Không logout khi lỗi HR:** 401/403/5xx/network của hr-api KHÔNG được xóa phiên chat.
8. **List response = `data.items`** (không phải `data`) do interceptor normalize.
9. **participants add/remove:** ưu tiên gửi full set qua `updateEvent.participantIds` (reconcile). Endpoint lẻ 7/8 chưa có client.
10. **Attachments (đính kèm file/ảnh):** FE ship **đầy đủ & LUÔN BẬT** (upload adapter, giữ file khi sửa, render người xem có xem/tải + icon theo loại). Chạy qua **mock IndexedDB** (`calendarAttachmentMockStore.ts`) tới khi nối BE. Nối BE: set `VITE_CALENDAR_ATTACHMENTS_MOCK=false` (cần chat-api purpose `calendar_attachment` không conversationId + hr-api `attachmentFileIds`/`attachments[]` ở CẢ list & single). Xem mục 10.

---

## 7. Wrapper / UI liên quan (FE)

| File | Vai trò |
|---|---|
| [src/features/calendar/pages/CalendarPage.tsx](../src/features/calendar/pages/CalendarPage.tsx) | Trang lịch chính; gộp 4 nguồn; xử lý create/update/delete + upload attachments (chờ). |
| `src/features/calendar/components/DayView.tsx` / `WeekView.tsx` | Day/Week view kiểu Teams (xem `docs/CALENDAR_SPEC.md`). |
| `src/features/calendar/components/WeeklyCalendarWidget.tsx` | Widget lịch tuần thu gọn cho màn NoChatSelected. |
| `src/features/calendar/components/HrNotificationBell.tsx` | Chuông thông báo mời họp (polling `hrNotificationApi`). |
| [src/features/calendar/utils/calendarEventMapping.ts](../src/features/calendar/utils/calendarEventMapping.ts) | Map HRCalendarEvent → ExtendedCalendarEvent; time/date/type/avatar. |
| `src/hooks/useMyHrProfile.ts` | Poll `/auth/me` (~60s) lấy identity. |
| `src/components/ui/PersonalEventFormModal.tsx` / `MeetingFormModal.tsx` | Form tạo/sửa lịch cá nhân / họp. |
| `src/components/ui/CalendarAttachmentZone.tsx` | UI chọn/drag-drop file (attachments — chờ contract upload). |

---

## 8. Cách kiểm chứng nhanh (curl)

```bash
# List lịch của mình tháng 7
curl -s "$HR/calendar/events?from=2026-07-01&to=2026-07-31&pageSize=100" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.items | length'

# Chi tiết 1 event
curl -s "$HR/calendar/events/$ID" -H "Authorization: Bearer $TOKEN" | jq '.data'

# Quyền
curl -s "$HR/calendar/events/$ID/permissions" -H "Authorization: Bearer $TOKEN" | jq '.data'

# Tạo lịch cá nhân
curl -s -X POST "$HR/calendar/events" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test","startAt":"2026-07-02T02:00:00Z","endAt":"2026-07-02T03:00:00Z","eventType":"PERSONAL","visibility":"PRIVATE"}' \
  | jq '.data.id'

# Phản hồi mời họp
curl -s -X PATCH "$HR/calendar/events/$ID/participants/me" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"response":"ACCEPTED"}' | jq '.data.response'

# Chấm công tháng
curl -s "$HR/attendance/calendar/me?from=2026-07-01&to=2026-07-31" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.items | length, .data.reason'

# Thông báo chưa đọc
curl -s "$HR/notifications/unread-count" -H "Authorization: Bearer $TOKEN" | jq '.data.count'
```
`$HR` = `HR_API_BASE_URL` (vd `https://hrm.hacomholdings.com.vn/api/v1`).

---

## 9. Mã lỗi tổng hợp

| Status / code | Endpoint | Nguyên nhân |
|---|---|---|
| 400 `endAt must be after startAt` | create/update | khoảng thời gian sai |
| 400 `Cannot add owner as participant` | create | owner trong participantIds |
| 400 `Conflicting event type` / `Conflicting visibility` | create | alias `eventType/type` hoặc `visibility/isPublic` mâu thuẫn |
| 400 `Invalid calendar visibility` | list/create | visibility ngoài enum |
| 400 `Participant already exists` | POST participant | trùng |
| 403 Forbidden | getById/update/delete/participants | thiếu canView/canEdit/canDelete |
| 404 Not found | mọi :id | event/participant không tồn tại hoặc đã xóa |
| 422 `EMPLOYEE_LINK_REQUIRED` | create HR-scope / respond | tài khoản chưa liên kết employee |
| 422 `PERSONAL events cannot have participants` | create | PERSONAL + participants |

> HR client: 401/403 **không** logout (optional-feature). HTML response → `HR_API_HTML_RESPONSE` (sai base URL).

---

## 10. Contract xuyên repo (source of truth)

Thư mục: `d:\HacomCTY\chat-api-service\docs\requests\` (xem CLAUDE.md mục 15).

| File | Trạng thái | Nội dung |
|---|---|---|
| `Done/FE__calendar-participant-avatar__contract__29-06-26.md` | ✅ Done | avatar owner/participant — FE batch-load theo authUserId |
| `FE__calendar-events-overlap-range__contract__20-06-26.md` | — | filter theo khoảng chồng lấn (overlap) thay vì chỉ startAt |
| `FE__calendar-attachments__contract__01-07-26.md` | **CHỜ XÁC NHẬN** | đính kèm file/ảnh: cần `calendar_attachment` purpose (chat-api, **không** conversationId) + `attachmentFileIds` (create/update) + `attachments[]` (get) phía hr-api |

**Attachments — FE ĐÃ ship, chờ BE bật cờ:**
- chat-api: thêm purpose `calendar_attachment` vào whitelist `/files/upload-url` + `/files/complete`, **không bắt buộc conversationId**.
- hr-api: create/update nhận `attachmentFileIds: string[]` (update = full desired set, reconcile như participants); get trả `attachments: CalendarAttachmentDto[] | null` (`{ fileId, filename, mimeType, sizeBytes, url, thumbnailUrl? }`).
- FE hoàn thiện toàn bộ sau flag `VITE_CALENDAR_ATTACHMENTS` (OFF). Điểm FE: `uploadCalendarAttachment.ts` (upload adapter), `CalendarAttachmentZone.tsx` (`CalendarAttachmentList` cho người xem), `CalendarPage.tsx` (4 handlers + `remoteAttachmentsToForm` + detail render). Bật cờ + gỡ workaround `api.ts:139` khi BE + shared-types xong.
