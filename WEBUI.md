# WEBUI.md — Bảng màu & Hướng dẫn chỉnh UI

Tài liệu **chỉ dành cho việc thiết kế / chỉnh UI**. Đọc file này trước khi sửa bất kỳ màu nào — **không hardcode từ trí nhớ**.

> Nguồn dữ liệu: `src/index.css`, `src/components/ui/Button.tsx`, `src/shared/layout/SideRail.tsx`, `src/components/layout/sidebar/RoomItem.tsx`, `tailwind.config.js`.

---

## 1. Quy tắc màu tổng quát

App dùng **hai vùng màu** tách biệt:

| Vùng | Màu | Ghi chú |
|---|---|---|
| **Thanh điều hướng trái (SideRail)** | Đỏ + Vàng | `#D32F2F → #C41E3A`, badge vàng `#FFC857` |
| **Màn Đăng nhập** | Đỏ + Vàng | Gradient nút `#C41E3A → #D32F2F → #FFC857` |
| **Toàn bộ app còn lại** | Xanh dương | `#1976D2` (medium blue) / `#1565C0` (dark blue) |

---

## 2. Brand Palette — Đỏ + Vàng (chỉ SideRail & LoginPage)

### 2.1 Màu đỏ
| Hex | Tên | Dùng ở đâu |
|---|---|---|
| `#C41E3A` | Crimson | Gradient rail (đáy); chữ badge rail; shadow nút login |
| `#D32F2F` | Red 600 | Gradient rail (đỉnh); gradient nút login (giữa); box-shadow rail |
| `#B71C1C` | Red 700 | Viền phải rail; inset shadow rail (light mode); gradient rail dark (đỉnh) |
| `#8B0000` | Dark red | Gradient rail dark mode (đáy) |
| `#7F1717` | | Border + inset shadow rail trong dark mode |

### 2.2 Màu vàng
| Hex | Tên | Dùng ở đâu |
|---|---|---|
| `#FFC857` | Amber sáng | Nền badge số unread trên rail; điểm cuối gradient nút login |
| `#FACC15` | Yellow 400 | Indicator thanh dọc item rail active (đỉnh) |
| `#EAB308` | Yellow 500 | Indicator rail active (đáy); shadow indicator |

---

## 3. Brand Palette — Xanh dương (toàn bộ app, trừ SideRail & Login)

| Hex | Tên | Dùng ở đâu |
|---|---|---|
| `#1976D2` | Blue 700 | Gradient (đỉnh); border; shadow; focus ring |
| `#1565C0` | Blue 800 | Gradient (đáy); text màu brand; checked state |
| `#DBEAFE` | Blue 50 | Background highlight nhạt (hover, active, badge bg) |

### Các pattern xanh hay dùng
```
Gradient nút/toggle/checkbox:  from-[#1976D2] to-[#1565C0]
Text brand:                     text-[#1565C0]
Background badge/highlight:     bg-[#1976D2]/10  hoặc  bg-[#DBEAFE]
Border active:                  border-[#1976D2]/60
Focus ring:                     focus:ring-[#1565C0]/25
Hover bg nhạt:                  bg-[#1976D2]/8
```

---

## 4. File & màu chi tiết từng thành phần

### 4.1 SideRail — `src/index.css` (dòng 1382–1554)

```css
/* Light mode */
.hc-side-rail {
  background: linear-gradient(180deg, #D32F2F 0%, #C41E3A 100%);
  border-right: 1px solid #B71C1C;
  box-shadow: inset -1px 0 0 #B71C1C, 2px 0 16px rgb(211 47 47 / 0.18);
}

/* Dark mode */
:root[data-theme="dark"] .hc-side-rail {
  background: linear-gradient(180deg, #B71C1C 0%, #8B0000 100%);
  border-right-color: #7F1717;
  box-shadow: inset -1px 0 0 #7F1717, 2px 0 16px rgb(211 47 47 / 0.3);
}

/* Icon (inactive) */
.hc-side-rail__item { color: rgba(255, 255, 255, 0.7); }

/* Icon (hover) */
.hc-side-rail__item:hover {
  color: #FFFFFF;
  background: rgba(255, 255, 255, 0.15);
}

/* Icon (active) */
.hc-side-rail__item--active {
  color: #FFFFFF;
  background: rgba(255, 255, 255, 0.2);
}

/* Indicator thanh dọc (active) */
.hc-side-rail__item-indicator {
  background: linear-gradient(180deg, #FACC15 0%, #EAB308 100%);
  box-shadow: 1px 0 6px rgb(234 179 8 / 0.5);
}

/* Badge số unread */
.hc-side-rail__badge {
  background: #FFC857;
  color: #C41E3A;
  box-shadow: 0 2px 6px rgba(255, 200, 87, 0.4);
}

/* Logo (nền trắng) */
.hc-side-rail__logo {
  background: white;
  color: var(--hc-primary-800); /* #1e293b */
}
```

---

### 4.2 Button — `src/components/ui/Button.tsx`

```typescript
const variantClasses = {
  // CTA nội bộ app (màn sau đăng nhập)
  brand:
    "border border-[#1565C0] bg-gradient-to-r from-[#1976D2] to-[#1565C0]
     text-white shadow-md shadow-[#1565C0]/20
     hover:brightness-105 focus:ring-[#1565C0]/25",

  // Nút phụ/hủy đi kèm brand
  "brand-outline":
    "border border-[#1976D2]/60 bg-transparent text-[#1565C0]
     hover:bg-[#1976D2]/8 active:bg-[#1976D2]/12
     focus:ring-[#1565C0]/25",

  // Không dùng nữa (giữ lại chỉ tương thích)
  "brand-yellow":
    "border border-[#1565C0]/70 bg-gradient-to-r from-[#1565C0] to-[#1976D2]
     text-white shadow-md shadow-[#1565C0]/25
     hover:brightness-105 focus:ring-[#1565C0]/25",

  // Semantic variants — không thay đổi
  primary:   "border-primary bg-primary text-text-inverse hover:bg-primary-hover",
  secondary: "border-border bg-surface-overlay text-text-primary hover:bg-surface-hover",
  outline:   "border-primary/40 bg-transparent text-primary hover:bg-primary/10",
  ghost:     "border-transparent bg-transparent text-text-secondary hover:bg-surface-hover",
  danger:    "border-danger bg-danger text-text-inverse hover:bg-danger-hover",
};
```

**Quy tắc dùng Button:**
- Nút submit/lưu chính → `variant="brand"`
- Nút hủy đi kèm → `variant="brand-outline"`
- Nút xóa/phá hoại → `variant="danger"`
- Nút phụ trợ → `variant="ghost"` hoặc `variant="secondary"`

---

### 4.3 Badge unread (RoomItem) — `src/components/layout/sidebar/RoomItem.tsx`

```typescript
const ROOM_ITEM_STATE_MAP = {
  default: {
    container: "bg-transparent",
    unreadBadge: "bg-[#FFC857] text-[#C41E3A]",  // vàng + đỏ (khớp SideRail)
  },
  active: {
    container: "bg-[#DBEAFE]/10",                  // highlight xanh rất nhạt
    unreadBadge: "bg-[#FFC857] text-[#C41E3A]",
  },
  unread: {
    container: "bg-transparent",
    unreadBadge: "bg-[#FFC857] text-[#C41E3A]",
  },
  muted: {
    unreadBadge: "bg-text-muted text-text-inverse",  // xám — đã tắt thông báo
  },
  mention: {
    container: "bg-danger/6",
    unreadBadge: "bg-danger text-text-inverse",       // đỏ danger — có mention
  },
};
```

> Badge unread dùng vàng+đỏ (`#FFC857` / `#C41E3A`) để **đồng bộ màu với badge trên SideRail**.

---

### 4.4 Toggle, Checkbox, RadioGroup — trạng thái active

Tất cả đều dùng gradient xanh dương:

**ToggleSwitch** — `src/components/settings/ToggleSwitch.tsx`:
```tsx
checked ? "bg-gradient-to-r from-[#1976D2] to-[#1565C0] shadow-xs"
        : "bg-border-strong/55"
// Focus: focus-visible:ring-2 focus-visible:ring-[#1976D2]/30
```

**Checkbox** — `src/components/ui/Checkbox.tsx`:
```tsx
"peer-checked:border-[#1565C0]
 peer-checked:bg-gradient-to-br peer-checked:from-[#1565C0] peer-checked:to-[#1976D2]"
// Focus: peer-focus:ring-2 peer-focus:ring-[#1976D2]/30
```

**RadioGroup** — `src/components/settings/RadioGroup.tsx`:
- Pills active: `bg-gradient-to-r from-[#1976D2] to-[#1565C0] text-white shadow-xs`
- Cards active: `border-[#1976D2]/25 bg-[#1976D2]/8`, icon `bg-[#1976D2]/10 text-[#1565C0]`
- Radio dot: `border-[#1565C0]` / `bg-[#1565C0]`

**ThemeToggle** — `src/components/common/ThemeToggle.tsx`:
```tsx
active ? "bg-gradient-to-r from-[#1976D2] to-[#1565C0] text-white shadow-xs"
       : "text-text-secondary hover:bg-surface hover:text-text-primary"
```

---

### 4.5 NewChatButton & SendButton

**NewChatButton** — `src/components/conversation/NewChatButton.tsx`:
```tsx
"bg-gradient-to-r from-[#1976D2] to-[#1565C0]
 text-white shadow-lg hover:brightness-105 hover:scale-105 active:scale-95"
```

**SendButton** — `src/components/input/SendButton.tsx`:
```tsx
// Sẵn sàng gửi:
"border-transparent bg-gradient-to-r from-[#1976D2] to-[#1565C0]
 text-white shadow-md shadow-[#1565C0]/15 hover:brightness-105 active:scale-95"

// Đang upload:
"border-[#1976D2]/25 bg-[#DBEAFE]/12 text-[#1565C0]"
```

---

### 4.6 LoginPage & PasswordLoginForm (GIỮ NGUYÊN ĐỎ/VÀNG)

**`src/pages/LoginPage.tsx`** — tiêu đề gradient:
```tsx
"bg-gradient-to-r from-[#C41E3A] via-[#D32F2F] to-[#FFC857]
 bg-clip-text text-transparent"
```

**`src/components/auth/PasswordLoginForm.tsx`** — nút Đăng nhập:
```tsx
className="h-12 rounded-xl
  bg-gradient-to-r from-[#C41E3A] via-[#D32F2F] to-[#FFC857]
  text-sm font-bold text-white
  hover:brightness-105 active:scale-95
  shadow-lg shadow-[#C41E3A]/25"
```

---

### 4.7 ProfileSettingsSection (GIỮ NGUYÊN — CÓ ĐỎ/VÀNG)

**`src/features/profile/components/ProfileSettingsSection.tsx`**:
- Avatar ring: `ring-2 ring-[#C41E3A]/20`
- Job title text: `text-[#C41E3A]`
- Background nhạt: `bg-[#FFC857]/4`
- Hover item: `hover:bg-[#FFC857]/4`

---

### 4.8 CSS Variables hệ thống — `src/index.css`

```css
/* Hacom palette cố định (không thay đổi theo dark/light) */
--hc-primary-900: #0f172a;
--hc-primary-800: #1e293b;
--hc-primary-700: #0045a5;
--hc-primary-600: #0057c8;
--hc-primary-500: #0068ff;    /* xanh — dùng cho text/header chung */
--hc-primary-100: #f0f7ff;
--hc-primary-50:  #f8fbff;
--hc-cyan-500:    #22c7e8;
--hc-success-600: #16a34a;
--hc-warning-500: #f59e0b;
--hc-danger-600:  #dc2626;
--hc-danger-50:   #fef2f2;

/* Semantic tokens (thay đổi theo light/dark) */
--color-primary:        206 100% 41%   /* xanh brand default */
--color-danger:         0 84% 60%      /* ≈ #ef4444 — KHÔNG phải brand đỏ */
--color-warning:        42 96% 50%     /* ≈ #f5b800 — KHÔNG phải brand vàng */

/* Surface & text */
--hc-surface:           #ffffff
--hc-border:            #d7dce3
--hc-border-soft:       #e5e7eb
--hc-text-900:          #0f172a
--hc-text-500:          #64748b
--hc-bg-app:            #eef2f7
```

> `--color-danger` / `--color-warning` là **semantic state** — không phải màu brand. Dùng `text-danger`, `bg-danger/10` cho trạng thái lỗi/cảnh báo, không dùng cho brand UI.

---

### 4.9 Module Sidebar & Main Header

```css
.hc-module-sidebar {
  background: var(--hc-surface);          /* #ffffff */
  border-right: 1px solid var(--hc-border); /* #d7dce3 */
}
.hc-module-sidebar__header {
  border-bottom: 1px solid var(--hc-border-soft); /* #e5e7eb */
}
.hc-module-sidebar__title { color: var(--hc-text-900); } /* #0f172a */

.hc-main-header {
  background: var(--hc-surface);          /* #ffffff */
  border-bottom: 1px solid var(--hc-border); /* #d7dce3 */
}
```

---

## 5. Toàn bộ màn UI

### 5.1 Routes Public
| Path | File | Màu |
|---|---|---|
| `/login` | `src/pages/LoginPage.tsx` | **ĐỎ + VÀNG** (giữ nguyên) |
| `/activation` | `src/features/activation/pages/ActivationFlowPage.tsx` | Xanh dương |
| `/verify-email` | `src/pages/VerifyEmailPage.tsx` | Xanh dương |
| `/forgot-password` | `src/pages/ForgotPasswordPage.tsx` | Xanh dương |
| `/reset-password` | `src/pages/ResetPasswordPage.tsx` | Xanh dương |
| `/force-change-password` | `src/pages/ForceChangePasswordPage.tsx` | Xanh dương |

### 5.2 Routes Private
| Path | File | Ghi chú |
|---|---|---|
| `/chat/:id?` | `src/pages/ChatPage.tsx` | SideRail đỏ, app xanh |
| `/friends` | `src/pages/FriendsPage.tsx` | Xanh dương |
| `/tasks` | `src/features/tasks/pages/TasksPage.tsx` | Xanh dương |
| `/calendar` | `src/features/calendar/pages/CalendarPage.tsx` | Xanh dương |
| `/ai-assistant` | `src/features/ai-assistant/pages/AiAssistantPage.tsx` | Xanh dương |
| `/notifications` | `src/pages/NotificationsPage.tsx` | Xanh dương |
| `/settings` | `src/pages/SettingsPage.tsx` | Xanh dương |

### 5.3 Layout dùng chung
- `src/layouts/AuthenticatedLayout.tsx` — chứa `PersistentNavigationRail` (SideRail đỏ)
- `src/shared/layout/SideRail.tsx` — component SideRail
- `src/components/auth/AuthLayoutSplit.tsx` — split 50/50 cho màn auth

---

## 6. Checklist khi thêm UI mới

| Việc cần làm | Pattern |
|---|---|
| Thêm nút CTA chính | `variant="brand"` → xanh |
| Thêm nút hủy/phụ | `variant="brand-outline"` → xanh outline |
| Thêm nút xóa | `variant="danger"` |
| Thêm badge số đếm | `bg-[#FFC857] text-[#C41E3A]` (vàng+đỏ, khớp rail) |
| Thêm badge filter active | `bg-[#1976D2]/10 text-[#1565C0]` (xanh nhạt) |
| Thêm toggle/checkbox | gradient `from-[#1976D2] to-[#1565C0]` |
| Focus ring input | `focus:border-[#1976D2]/60 focus:ring-[#1565C0]/25` |
| Active row/item | `bg-[#DBEAFE]/10` hoặc `bg-[#1976D2]/8` |
| Icon accent | `text-[#1565C0]` |
| Màn Login/SideRail | Giữ nguyên đỏ/vàng — **không đổi** |
