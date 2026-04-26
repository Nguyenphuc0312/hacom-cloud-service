# REFACTOR_UI_PLAN.md

# Kế hoạch refactor UI cho `chat-admin-panel`

## 1. Mục tiêu

Refactor `chat-admin-panel` từ giao diện nội bộ tạm bợ sang một giao diện **production-grade SaaS admin dashboard**: chắc layout, ít nhiễu, dễ vận hành, giống một công cụ quản trị thật cho hệ thống chat/ERP nội bộ.

Visual direction lấy cảm hứng từ giao diện tham chiếu:

- Sidebar cố định, gọn, phân cấp rõ.
- Main content card-based.
- Nền app xám nhạt, surface trắng.
- Accent tím dùng tiết chế.
- Table rõ ràng, row height ổn định.
- Không dùng gradient/glassmorphism/animation quá tay.
- Không làm UI kiểu AI-generated template.

---

## 2. Nguyên tắc thiết kế bắt buộc

### 2.1. Layout phải chắc

- Sidebar desktop phải cố định chiều rộng.
- Main content không được nhảy khi đổi route.
- Toolbar không được làm xô layout khi filter/search thay đổi.
- Table phải tự scroll ngang trong card nếu thiếu chiều rộng.
- Text dài phải truncate, không phá row/table/card.
- Loading state không được làm nhảy kích thước card/table.

### 2.2. Ít chữ, nhiều cấu trúc

- Page title + subtitle ngắn.
- Card không chứa mô tả dài.
- Tooltip/drawer dùng cho thông tin phụ.
- JSON/log detail không hiển thị trực tiếp trong table.

### 2.3. Production hơn là đẹp màu mè

Không dùng:

- Gradient lòe loẹt.
- Glassmorphism.
- Shadow nặng.
- Background pattern.
- Animation phô trương.
- Illustration màu mè.
- Card quá lớn nhưng ít dữ liệu.
- Mock data giả làm dữ liệu thật.

### 2.4. Không phá business logic

- Không đổi API contract nếu không cần.
- Không đổi auth/access logic.
- Không đổi role/permission logic.
- Không đổi route hiện có nếu không có migration rõ.
- Không fake metrics nếu chưa có API.

---

## 3. Visual system mục tiêu

### 3.1. Design tokens đề xuất

```scss
:root {
  --app-bg: #e9e7e4;
  --surface: #ffffff;
  --surface-muted: #f7f7f8;
  --surface-subtle: #fbfbfc;
  --border: #e8e8ec;
  --border-strong: #d8d8df;

  --text-primary: #111827;
  --text-secondary: #6b7280;
  --text-muted: #9ca3af;

  --brand: #6f4cf6;
  --brand-hover: #5b3ee6;
  --brand-soft: #eee9ff;

  --success: #15803d;
  --success-soft: #e8f7ee;

  --warning: #d97706;
  --warning-soft: #fff4df;

  --danger: #dc2626;
  --danger-soft: #feecec;

  --info: #2563eb;
  --info-soft: #eaf1ff;

  --radius-card: 16px;
  --radius-control: 10px;
  --radius-pill: 999px;

  --sidebar-width: 224px;
  --topbar-height: 64px;

  --shadow-card: 0 1px 2px rgba(15, 23, 42, 0.04);
}
```

### 3.2. Typography

```txt
Font: Inter hoặc system-ui
Page title: 20px / 600
Page subtitle: 13px / 400
Section title: 15px / 600
Body: 13px hoặc 14px
Table text: 12.5px hoặc 13px
Muted text: 12px
Button text: 13px / 500
```

### 3.3. Spacing

```txt
App padding desktop: 24px
App padding tablet: 16px
Card padding: 16px
Card gap: 16px
Toolbar height: 40px
Sidebar item height: 36px - 40px
Table row height: 44px - 52px
Table header height: 36px - 40px
```

### 3.4. Card style

```scss
.admin-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
}
```

---

## 4. Information architecture đề xuất

Chỉ map các route đã tồn tại. Route nào chưa có thì không tạo page rỗng gây nhiễu; có thể ẩn hoặc disable.

```txt
Dashboard

Identity
- Users
- HR Employees
- Roles
- Sessions

Chat System
- Conversations
- Messages
- Files
- Realtime

Access Control
- Admin Access
- IP Rules
- Audit Logs

Operations
- System Logs
- Services
- Health Check
- Settings
```

---

## 5. Component system cần chuẩn hóa

### 5.1. Layout components

- `AdminShell`
- `AdminSidebar`
- `AdminTopbar`
- `MainContent`
- `PageHeader`
- `PageToolbar`

Yêu cầu:

- Dùng chung cho toàn bộ admin.
- Không mỗi page tự dựng layout riêng.
- Sidebar desktop fixed/sticky.
- Mobile/tablet có thể dùng drawer nếu hiện tại có nhu cầu.
- Main content có overflow handling rõ.

### 5.2. Data display components

- `StatCard`
- `DashboardCard`
- `DataTable`
- `StatusBadge`
- `SourceBadge`
- `AvatarCell`
- `MetaCell`
- `DateTimeCell`
- `ActionMenu`

Yêu cầu `DataTable`:

- Header rõ.
- Row height ổn định.
- Có loading skeleton.
- Có empty state.
- Có error state + retry.
- Có pagination.
- Có sort indicator nếu page hỗ trợ sort.
- Truncate text dài.
- Detail dài mở bằng drawer/modal, không nhồi vào row.

### 5.3. Feedback components

- `EmptyState`
- `ErrorState`
- `PermissionDeniedState`
- `RateLimitState`
- `CardSkeleton`
- `TableSkeleton`
- `InlineSpinner`
- `Toast`

### 5.4. Overlay components

- `ConfirmDialog`
- `DetailDrawer`
- `FilterPopover`
- `CommandSearch` nếu dự án có nhu cầu tìm nhanh.

---

## 6. Page refactor plan

## 6.1. Dashboard / System Overview

### Header

```txt
System Overview
Monitor users, access control, realtime health, and system activity.
```

### Toolbar

- Search nếu có tác dụng thật.
- Date range nếu có dữ liệu thật.
- Refresh button.
- Không fake filter nếu chưa có logic.

### KPI cards đề xuất

- Total Users
- Active Users
- Pending Admin Access
- Realtime Connections
- Failed Logins
- API Errors

Card format:

```txt
Label
Value
Small meta: updated time / trend / source
Icon
```

### Chart cards

Nếu có API thật:

- Message Volume
- Login Attempts
- Admin Access Requests
- Service Health

Nếu chưa có API:

- Hiển thị empty state: `No metrics available yet`.
- Không tạo chart giả gây hiểu nhầm.

### Recent tables

- Recent Admin Requests
- Recent Audit Logs
- Recent System Errors

---

## 6.2. User Management

### Header

```txt
User Management
Manage accounts, HR-linked identities, roles, and account status.
```

### Toolbar

- Search placeholder: `Search name, email, employee code...`
- Filter: department, status, role.
- Refresh.
- Export nếu đã có logic.

### Table columns

- User
- Employee Code
- Email
- Department
- Role
- Status
- HR Linked
- Updated At
- Actions

### Bắt buộc

- Avatar 28px - 32px.
- Name là text chính.
- Email/employee code là text phụ nếu cần.
- Department dài phải truncate.
- Status dùng badge.
- Actions gom vào menu, không trải quá nhiều nút.
- Error state có retry.
- Empty state có hướng dẫn ngắn.

---

## 6.3. HR Employees

### Header

```txt
HR Employees
Review employee records synced from HR and linked user accounts.
```

### Table columns

- Employee
- Employee Code
- Email
- Department
- Unit Code
- Job Title
- Linked User
- Status
- Updated At

### Lưu ý

- Không để tên dài hoặc phòng ban dài phá layout.
- Nếu employee chưa linked user, badge `Unlinked`.
- Nếu đã linked, hiển thị user compact.

---

## 6.4. Admin Access Control

### Header

```txt
Admin Access Control
Review IP approvals, access requests, and admin console access state.
```

### KPI cards

- Approved
- Pending
- Rejected
- Expiring Soon

### Table columns

- IP Address
- Normalized IP
- Scope
- Status
- Source
- Matched Rule
- First Seen
- Last Seen
- Expires At
- Actions

### Badge rules

```txt
approved -> green
pending -> amber
rejected -> red
expired -> gray
manual/bootstrap -> gray or purple
request -> blue
rule -> purple
```

### Lưu ý

- Không show raw JSON trong table.
- Detail request/rule mở drawer.
- IP dài vẫn không làm vỡ bảng.
- Action nguy hiểm cần confirm dialog.

---

## 6.5. Audit Logs / System Logs

### Header

```txt
Audit Logs
Track administrative actions, access decisions, and system events.
```

### Toolbar

- Search.
- Service filter.
- Level filter.
- Date range.
- Request ID filter.

### Table columns

- Time
- Level
- Service
- Message
- Request ID
- User/IP
- Actions

### Detail drawer

- Hiển thị JSON/log detail dạng monospace.
- Có copy requestId.
- Có copy raw log.
- Không để log dài xuất hiện trong row.

### Level badge

```txt
error -> red
warn -> amber
info -> blue/gray
debug -> gray
```

---

## 6.6. Conversations / Messages

### Conversations table

- Conversation
- Type
- Members
- Last Message At
- Status
- Created At
- Actions

### Messages table

- Time
- Sender
- Conversation
- Preview
- Status
- Message Seq
- Actions

### Lưu ý

- Message preview phải clamp 1 dòng.
- Message quá dài mở drawer.
- Không render full message trong table.

---

## 7. Error, empty, loading states

Cần chuẩn hóa toàn bộ:

- 403 Forbidden.
- 404 Not Found.
- 500 Internal Error.
- Network Error.
- Empty State.
- Rate Limit State.
- Permission Denied.
- Skeleton Loading.

Yêu cầu:

- Cùng visual system.
- Không illustration màu mè.
- Có action rõ: `Retry`, `Back`, `Go Dashboard`.
- Không để màn hình trắng khi API lỗi.

---

## 8. Responsive rules

### Desktop >= 1280px

- Sidebar cố định.
- Main content dùng grid.
- Table nằm trong card.
- Card grid 3-4 cột tùy width.

### Tablet 768px - 1279px

- Sidebar có thể thu gọn hoặc drawer.
- KPI grid 2 cột.
- Table scroll ngang trong card.

### Mobile < 768px

- Admin không cần tối ưu như app consumer, nhưng không được vỡ.
- Sidebar drawer.
- KPI 1 cột.
- Toolbar wrap có kiểm soát.
- Table vẫn scroll ngang.

---

## 9. Accessibility tối thiểu

- Focus state rõ cho button/input/menu.
- Contrast đủ đọc.
- Icon-only button phải có `aria-label`.
- Drawer/dialog trap focus nếu thư viện hỗ trợ.
- Không chỉ dùng màu để truyền trạng thái; badge cần text.
- Table action menu dùng keyboard được nếu component hiện tại hỗ trợ.

---

## 10. Implementation phases

## Phase 1 — UI audit

Tạo file:

```txt
docs/admin-ui-audit.md
```

Nội dung:

- Route/page hiện có.
- Component layout/table/card/form/sidebar/topbar hiện có.
- Vấn đề UI cụ thể.
- File liên quan.
- Impact.
- Hướng fix.

## Phase 2 — Design tokens

Tạo/chuẩn hóa:

```txt
src/styles/tokens.scss
src/styles/admin-theme.scss
```

Hoặc vị trí tương đương theo stack hiện tại.

## Phase 3 — Admin Shell

Refactor:

- `AdminShell`
- `AdminSidebar`
- `AdminTopbar`
- `PageHeader`
- `PageToolbar`

## Phase 4 — Shared components

Tạo/chuẩn hóa:

- `StatCard`
- `DashboardCard`
- `DataTable`
- `StatusBadge`
- `EmptyState`
- `ErrorState`
- `Skeleton`

## Phase 5 — Dashboard

Refactor Dashboard theo layout production.

## Phase 6 — User / HR pages

Refactor User Management và HR Employees trước vì đây là trang nghiệp vụ quan trọng.

## Phase 7 — Access Control

Refactor Admin Access/IP Approval vì đây là luồng đang có nhiều lỗi vận hành.

## Phase 8 — Logs / Operations

Refactor Audit Logs, System Logs, Health Check.

## Phase 9 — Error pages

Chuẩn hóa 403/404/500/network/rate-limit.

## Phase 10 — Verify

Chạy:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

Nếu project không có đủ script, ghi rõ script nào thiếu và không tự bịa.

---

## 11. Definition of Done

Hoàn thành khi:

- Giao diện không còn cảm giác demo/AI slop.
- Sidebar rõ, chắc, nhất quán.
- Dashboard dùng card/table/chart layout gọn.
- User/Access/Log pages dùng chung DataTable system.
- Text dài không phá layout.
- Loading/error/empty state đầy đủ.
- Responsive không vỡ ở desktop/tablet/mobile.
- Build pass.
- Không phá API/business logic.
- Có tài liệu `docs/admin-ui-production-redesign.md`.

---

# PROMPT CHO AGENT

Bạn là senior frontend engineer + product UI engineer. Hãy refactor `chat-admin-panel` theo kế hoạch trong file `REFACTOR_UI_PLAN.md`.

Mục tiêu là chuyển giao diện admin hiện tại sang một admin dashboard production-grade giống SaaS thật: chắc layout, sidebar rõ, card/table gọn, màu sắc tiết chế, tránh hoàn toàn cảm giác AI-generated UI/slop.

Bối cảnh:
- Đây là admin panel cho hệ thống chat nội bộ/ERP microservice.
- Domain chính gồm user management, HR-linked employee profile, admin access control, IP approval, audit logs, system logs, chat conversations, realtime/service health.
- Không được phá API contract, auth logic, access logic, role/permission logic.
- Không fake metrics hoặc fake data nếu chưa có API thật.

Nhiệm vụ bắt buộc:

1. Đọc kỹ `REFACTOR_UI_PLAN.md`.
2. Audit toàn bộ UI hiện tại của `chat-admin-panel`.
3. Tạo `docs/admin-ui-audit.md`, ghi rõ:
   - route/page hiện có
   - component layout/table/card/form/sidebar/topbar hiện có
   - vấn đề UI cụ thể
   - file liên quan
   - impact
   - hướng fix
4. Tạo hoặc chuẩn hóa design tokens/theme:
   - app background xám nhạt
   - surface trắng
   - border mảnh
   - text primary/secondary/muted
   - brand tím
   - success/warning/danger/info
   - radius/card/control
   - spacing/sidebar/table row
5. Refactor Admin Shell:
   - sidebar fixed/sticky desktop
   - main content ổn định
   - page header chuẩn
   - toolbar chuẩn
   - responsive không vỡ
6. Tạo/chuẩn hóa shared components:
   - AdminShell
   - AdminSidebar
   - AdminTopbar
   - PageHeader
   - PageToolbar
   - StatCard
   - DashboardCard
   - DataTable
   - StatusBadge
   - EmptyState
   - ErrorState
   - TableSkeleton
   - CardSkeleton
   - DetailDrawer nếu cần
7. Refactor Dashboard:
   - title `System Overview`
   - KPI cards cho user/access/realtime/error
   - chart/table card nếu có dữ liệu thật
   - nếu chưa có API, dùng empty state, không fake chart
8. Refactor User Management:
   - table production-grade
   - search/filter rõ
   - columns: User, Employee Code, Email, Department, Role, Status, HR Linked, Updated At, Actions
   - text dài truncate + tooltip nếu có
   - loading/error/empty state
9. Refactor HR Employees nếu route tồn tại:
   - columns: Employee, Employee Code, Email, Department, Unit Code, Job Title, Linked User, Status, Updated At
10. Refactor Admin Access Control:
   - KPI Approved/Pending/Rejected/Expiring Soon
   - table columns: IP Address, Normalized IP, Scope, Status, Source, Matched Rule, First Seen, Last Seen, Expires At, Actions
   - badge status/source rõ
   - raw detail đưa vào drawer/modal, không nhồi trong table
11. Refactor Audit Logs/System Logs:
   - toolbar search/service/level/date/requestId
   - table columns: Time, Level, Service, Message, Request ID, User/IP, Actions
   - log dài mở drawer, không phá layout
12. Chuẩn hóa 403/404/500/network/rate-limit/empty/error/loading states.
13. Kiểm tra responsive:
   - 1366px
   - 1440px
   - 1920px
   - 1024px
   - mobile nhỏ
14. Chạy verify:
   - lint
   - typecheck
   - build
   - test nếu có
15. Tạo `docs/admin-ui-production-redesign.md`, ghi:
   - before/after summary
   - component đã tạo/sửa
   - route/page đã refactor
   - token/theme đã thêm
   - known limitations
   - manual QA checklist
   - verify result

Ràng buộc rất quan trọng:
- Không làm landing page.
- Không gradient/glassmorphism/shadow nặng.
- Không animation quá tay.
- Không mock data giả làm dữ liệu thật.
- Không đổi business logic nếu không cần.
- Không phá API contract.
- Không tạo route/page rỗng gây nhiễu.
- Không để text dài phá layout.
- Không để loading gây layout shift.
- Không để table tràn phá toàn trang; table phải scroll trong card.
- Không dùng quá nhiều màu.
- Không để mỗi page một layout riêng.

Definition of Done:
- Admin panel nhìn như sản phẩm production SaaS thật.
- Layout chắc, không xê dịch bất thường.
- Sidebar/menu rõ, có phân cấp.
- Dashboard/User/Access/Logs dùng chung visual system.
- Data table đọc được, thao tác được, có loading/error/empty.
- Text dài/log dài/message dài không phá UI.
- Responsive không vỡ.
- Build pass.
- Có đủ tài liệu audit và redesign.
