# CLAUDEUI.md — Bảng màu & các màn UI

Tài liệu **chỉ dành cho việc thiết kế / chỉnh UI**: tổng hợp toàn bộ màn hình của app và bảng màu nhận diện (đỏ, vàng, đỏ + vàng — đúng tông màn Đăng nhập). Khi sửa UI, lấy mã màu ở đây — **không hardcode lại từ trí nhớ**.

> Nguồn dữ liệu: `src/index.css`, `tailwind.config.js`, `src/router/config/*.ts`, `src/pages/**`, `src/features/*/pages/**`, `src/components/auth/PasswordLoginForm.tsx`, `src/shared/layout/*`.

---

## 1. Brand palette HACOM — Đỏ + Vàng

### 1.1 Đỏ (red / crimson) — màu chủ đạo
| Token / Hex | HSL | Dùng ở đâu |
|---|---|---|
| `#C41E3A` (crimson) | `350 73% 44%` | Gradient nút Đăng nhập (điểm bắt đầu); chữ trên badge vàng (`.hc-side-rail__badge` color); shadow nút login (`shadow-[#C41E3A]/25`) |
| `#D32F2F` (red 600) | `0 65% 51%` | Gradient nền sidebar rail (đỉnh); gradient nút Đăng nhập (giữa); box-shadow đổ bóng rail (`rgb(211 47 47 / 0.18)`) |
| `#B71C1C` (red 700) | `0 73% 41%` | Viền phải sidebar rail (`border-right`); inset shadow rail (light mode); gradient rail (top trong dark mode) |
| `#8B0000` (dark red) | `0 100% 27%` | Gradient sidebar rail dark mode (đáy) |
| `#7F1717` | `0 70% 29%` | Border + inset shadow rail trong dark mode |

### 1.2 Vàng (yellow / amber) — accent
| Token / Hex | HSL | Dùng ở đâu |
|---|---|---|
| `#FFC857` (amber sáng) | `40 100% 67%` | Background badge số (`.hc-side-rail__badge`); điểm kết thúc gradient nút Đăng nhập |
| `#FACC15` (yellow 400) | `48 96% 53%` | Indicator thanh dọc khi item rail active (đỉnh gradient) |
| `#EAB308` (yellow 500) | `45 93% 47%` | Indicator rail active (đáy gradient); shadow indicator (`rgb(234 179 8 / 0.5)`) |

### 1.3 Kết hợp Đỏ + Vàng (signature combo — như màn Đăng nhập)
Đây là **chữ ký nhận diện** của app. Khi muốn nhấn mạnh CTA quan trọng dùng đúng pattern này:

**Nút Đăng nhập** (`src/components/auth/PasswordLoginForm.tsx:137`):
```tsx
className="h-12 rounded-xl
  bg-gradient-to-r from-[#C41E3A] via-[#D32F2F] to-[#FFC857]
  text-sm font-bold text-white
  hover:brightness-105 active:scale-95
  shadow-lg shadow-[#C41E3A]/25"
```
- Gradient ngang: đỏ → đỏ sáng → vàng amber
- Chữ trắng, bóng đỏ 25%, brighten khi hover, scale nhẹ khi nhấn

**Sidebar rail + badge** (`src/index.css:1382-1530`):
- Nền rail: gradient dọc đỏ (`#D32F2F → #C41E3A`)
- Badge unread: nền `#FFC857`, chữ `#C41E3A` (đỏ trên nền vàng)
- Indicator item active: gradient vàng (`#FACC15 → #EAB308`)
- **Đây chính là combo đỏ + vàng dùng làm nhận diện chính** ở khu vực điều hướng.

### 1.4 Các sắc đỏ/vàng "ngữ nghĩa" (semantic — không phải brand)
Token CSS variables trong `src/index.css` (light theme defaults):
- `--color-danger: 0 84% 60%` → `hsl(0 84% 60%)` ≈ `#ef4444` (Tailwind red-500)
- `--color-danger-hover: 0 72% 50%` ≈ `#dc2626` (red-600)
- `--color-warning: 42 96% 50%` ≈ `#f5b800` (amber-ish)
- `--color-warning-hover: 38 94% 44%` ≈ `#d97706`
- `--color-away: 42 96% 50%` (= warning)
- `--state-danger-bg: 0 100% 97%` / `--state-danger-border: 0 76% 82%` — alert đỏ nhạt
- `--state-warning-bg: 46 100% 96%` / `--state-warning-border: 43 80% 76%` — alert vàng nhạt

Dùng trong code qua class Tailwind: `text-danger`, `bg-danger/10`, `border-danger/30`, `text-warning`, `bg-warning/10`, `text-state-away`, …

### 1.5 Các shade red/yellow Tailwind rải rác (ngoài token)
Một số nơi vẫn dùng class Tailwind native (không qua token) — biết để giữ tông nhất quán:
- `text-red-500 / bg-red-500/10` — icon PDF (`FileTypeIcon`, `PdfPreview`, `PdfJsViewer`), trạng thái lỗi file
- `text-rose-500 / bg-rose-500/10` — icon trong `HelpPage`, ngày cuối tuần `CalendarPage`, banner reply lỗi
- `bg-amber-500 / text-amber-600` — calendar tag "Cá nhân", icon audio, lưu trữ
- `text-yellow-600 / bg-yellow-500/10` — icon archive (`ArchivePreview`)
- `bg-red-500/20 text-red-600` — chip type PDF trong reply preview / thread group
- `bg-amber-500/20 text-amber-700` — chip type ZIP/RAR
- `bg-yellow-500 / bg-yellow-400` — chấm presence "away" / "idle" (`PresenceIndicator`)
- `bg-red-500 / bg-red-400` — chấm presence "dnd" / "busy"
- `URGENT badge`: `bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300` (task priority)

---

## 2. CSS variables liên quan màu Brand (cố định, không đổi theo theme dark)

Khối `:root` ở cuối `src/index.css` (sau dòng 395) định nghĩa "Hacom palette" độc lập:
```css
--hc-primary-900: #0f172a;
--hc-primary-800: #1e293b;
--hc-primary-700: #0045a5;
--hc-primary-600: #0057c8;
--hc-primary-500: #0068ff;       /* xanh — KHÔNG phải brand đỏ; dùng cho text/header chung */
--hc-primary-100: #f0f7ff;
--hc-primary-50:  #f8fbff;
--hc-cyan-500:    #22c7e8;
--hc-success-600: #16a34a;       /* xanh lá success */
--hc-warning-500: #f59e0b;       /* cam-vàng cảnh báo */
--hc-danger-600:  #dc2626;       /* đỏ danger */
--hc-danger-50:   #fef2f2;
```

> **Lưu ý:** `--hc-primary-*` ở đây là **xanh dương** dùng cho text/labels trong shell chung. Brand đỏ HACOM **không** lưu vào CSS var — chúng được hardcode trực tiếp ở `.hc-side-rail` và nút Đăng nhập.

---

## 3. Toàn bộ các màn UI (screens) trong app

### 3.1 Routes Public (chưa đăng nhập) — `src/router/config/publicRoutes.ts`
| Path | File | Mô tả UI |
|---|---|---|
| `/login` | `src/pages/LoginPage.tsx` | **Màn đăng nhập** — split layout (slider ảnh trái + form phải), tabs "Tài khoản" / "Quét QR", nút submit gradient **đỏ → vàng** |
| `/activation` | `src/features/activation/pages/ActivationFlowPage.tsx` | Kích hoạt tài khoản (OTP + set password) |
| `/verify-email` | `src/pages/VerifyEmailPage.tsx` | Xác minh email |
| `/forgot-password` | `src/pages/ForgotPasswordPage.tsx` | Quên mật khẩu |
| `/reset-password` | `src/pages/ResetPasswordPage.tsx` | Đặt lại mật khẩu |
| `/force-change-password` | `src/pages/ForceChangePasswordPage.tsx` | Bắt buộc đổi mật khẩu lần đầu |

Tất cả màn public dùng chung `AuthLayoutSplit` (slider ảnh HACOM bên trái) hoặc `AuthShell`.

### 3.2 Routes Private (đã đăng nhập) — `src/router/config/privateRoutes.ts`
| Path | File | Mô tả UI |
|---|---|---|
| `/chat/:conversationId?` | `src/pages/ChatPage.tsx` | **Màn chat chính** — sidebar rail đỏ, ModuleSidebar (danh sách hội thoại), ChatWindow (header + timeline + composer), Info panel phải |
| `/friends` | `src/pages/FriendsPage.tsx` | Danh sách bạn bè, lời mời, gợi ý |
| `/friend-discovery/:shareCode` | `src/pages/FriendsPage.tsx` | Thêm bạn qua shareCode/QR |
| `/join/:token` | `src/pages/JoinByLinkPage.tsx` | Vào nhóm qua invite link |
| `/tasks` | `src/features/tasks/pages/TasksPage.tsx` | Quản lý task (list + Kanban) |
| `/calendar` | `src/features/calendar/pages/CalendarPage.tsx` | Lịch & sự kiện |
| `/ai-assistant` | `src/features/ai-assistant/pages/AiAssistantPage.tsx` | Trợ lý AI |
| `/archive` | `src/pages/errors/ArchiveToAiRedirect.tsx` | Redirect → AI Assistant |
| `/notifications` | `src/pages/NotificationsPage.tsx` | Thông báo |
| `/settings` | `src/pages/SettingsPage.tsx` | Cài đặt (Appearance, Notification, Privacy, Chat, Security, Language, DangerZone…) |
| `/help` | `src/pages/HelpPage.tsx` | Trợ giúp |
| `/faq` | `src/pages/FAQPage.tsx` | FAQ |
| `/report-issue` | `src/pages/ReportIssuePage.tsx` | Báo lỗi |
| `/` | redirect → `/chat` | |

### 3.3 Màn lỗi — `src/pages/errors/*`
| Path | File |
|---|---|
| `/403` | `ForbiddenPage.tsx` |
| `/401` | `UnauthorizedPage.tsx` |
| `*` (404) | `NotFoundPage.tsx` |
| `/500` | `ServerErrorPage.tsx` |
| `/offline` | `OfflinePage.tsx` |
| `/429` | `RateLimitPage.tsx` |
| `/maintenance` | `MaintenancePage.tsx` |

### 3.4 Khung layout dùng chung
- `RootLayout` (`src/layouts/RootLayout.tsx`) — providers + Suspense + error boundary
- `AuthLayout` (`src/layouts/AuthLayout.tsx`) — khung public route
- `AuthenticatedLayout` = `AppLayout` (`src/layouts/AuthenticatedLayout.tsx`) — `GlobalWebSocketProvider` + `PersistentNavigationRail` (= SideRail đỏ) + `<Outlet />` + CommandPalette
- `AuthLayoutSplit` (`src/components/auth/AuthLayoutSplit.tsx`) — split 50/50 (slider ảnh trái + form phải dùng cho mọi màn auth)
- `AppShell` / `ModuleSidebar` / `MainHeader` / `SideRail` ở `src/shared/layout/`

---

## 4. Bảng "lookup nhanh" — muốn xài combo đỏ+vàng ở đâu thì copy đoạn nào

### 4.1 CTA quan trọng (giống nút Đăng nhập)
```tsx
className="h-12 rounded-xl
  bg-gradient-to-r from-[#C41E3A] via-[#D32F2F] to-[#FFC857]
  text-sm font-bold text-white
  hover:brightness-105 active:scale-95
  shadow-lg shadow-[#C41E3A]/25"
```

### 4.2 Pill / badge đỏ-trên-vàng (giống badge unread của sidebar rail)
```tsx
style={{
  background: "#FFC857",
  color: "#C41E3A",
  boxShadow: "0 2px 6px rgba(255, 200, 87, 0.4)",
}}
className="rounded-full px-2 py-0.5 text-[10px] font-bold"
```

### 4.3 Surface đỏ rắn (giống sidebar rail)
```css
background: linear-gradient(180deg, #D32F2F 0%, #C41E3A 100%);
border-right: 1px solid #B71C1C;
box-shadow: inset -1px 0 0 #B71C1C, 2px 0 16px rgb(211 47 47 / 0.18);
/* dark mode */
background: linear-gradient(180deg, #B71C1C 0%, #8B0000 100%);
```

### 4.4 Active indicator vàng (giống thanh dọc khi item rail được chọn)
```css
background: linear-gradient(180deg, #FACC15 0%, #EAB308 100%);
box-shadow: 1px 0 6px rgb(234 179 8 / 0.5);
```

### 4.5 Button variants brand (Button component — `src/components/ui/Button.tsx`)

Đã thêm 2 variant mới vào Button component:

**`variant="brand"`** — CTA chính (lưu, xác nhận, submit form chính):
```tsx
<Button variant="brand">Lưu thay đổi</Button>
// → gradient đỏ→vàng, shadow đỏ, chữ trắng
```

**`variant="brand-outline"`** — Nút phụ/hủy đi kèm CTA chính:
```tsx
<Button variant="brand-outline">Hủy</Button>
// → viền đỏ mờ, chữ đỏ, hover nền đỏ nhạt
```

> Không dùng `variant="primary"` hay `variant="outline"` cho CTA/cancel nữa — dùng brand/brand-outline.  
> Nút danger (xóa, hành động phá hoại) vẫn giữ `variant="danger"`.

### 4.6 Các pattern đồng bộ đã áp dụng toàn app

| Element | Trước | Sau |
|---|---|---|
| Active sidebar room item | `bg-[hsl(--chat-active-surface)/0.1)]` | `bg-[#FFC857]/10` |
| Hover tin nhắn | `hsl(--color-surface-hover / 0.18)` | `rgb(255 200 87 / 0.08)` |
| Input/search focus ring | `ring-focus/20`, viền xanh | `ring-[#FFC857]/15`, viền vàng |
| Tab active (SegmentedControl) | `bg-surface-hover text-text-primary` | `bg-[#FFC857]/30 text-text-primary` |
| Reply banner (ComposerReplyBanner) | `bg-surface-overlay/60` | `bg-[#FFC857]/8`, viền `border-[#FFC857]/20` |
| Badge/pill active filter | `bg-primary/12 text-primary` | `bg-[#FFC857]/20 text-[#C41E3A]` |
| Badge đếm (ghim, profile, settings) | `bg-primary/10 text-primary` | `bg-[#C41E3A]/10 text-[#C41E3A]` |
| Unread notification row | `bg-primary/6 border-primary/10` | `bg-[#FFC857]/6 border-[#FFC857]/20` |
| Checkbox checked | `bg-primary border-primary` | gradient `from-[#C41E3A] to-[#D32F2F]` |
| Checkbox focus ring | `ring-focus/20` | `ring-[#FFC857]/30` |
| Icon accent (pin, calendar) | `text-primary` | `text-[#C41E3A]` |

---

## 5. Quy tắc khi chỉnh UI (đọc lại memory)

- **Chỉ sửa styling/tokens — không động vào logic & cấu trúc** (theo feedback đã lưu).
- Brand đỏ + vàng **không** lưu trong CSS var — phải hardcode `#C41E3A`, `#D32F2F`, `#FFC857`, … hoặc rút ra thành utility riêng nếu cần dùng nhiều chỗ.
- Token `--color-danger` / `--color-warning` **không phải** brand red/yellow — chúng là semantic state. Đừng lẫn lộn.
- Khi thêm CTA mới → dùng `variant="brand"` (Button), khi thêm nút phụ/hủy → `variant="brand-outline"`.
- Khi thêm badge/pill đếm → `bg-[#C41E3A]/10 text-[#C41E3A]`. Khi thêm filter active → `bg-[#FFC857]/20 text-[#C41E3A]`.
- Focus ring trên mọi input → `ring-[#FFC857]/15` và viền `border-[#FFC857]/60`. Class `.input-surface:focus-within` đã xử lý tự động; với inline Tailwind dùng `focus:border-[#FFC857]/60 focus:ring-[#FFC857]/15`.
