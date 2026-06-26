# Admin Panel Documentation References

**Date:** 2026-06-05
**Repo:** `chat-admin-panel`
**Purpose:** Redirect to existing documentation and consolidate key references.

---

## 1. Existing Documentation

The `chat-admin-panel` repository has comprehensive documentation already in place.

### 1.1. Primary Audit Document

| File | Purpose |
|---|---|
| `docs/admin-ui-audit.md` | Full admin UI audit — 7 P0 findings, stack overview, route inventory |

**Read this first.** Comprehensive audit covering all pages, components, and findings.

### 1.2. Refactor Plan

| File | Lines | Purpose |
|---|---|---|
| `REFACTOR_UI_PLAN.md` | ~270 | Phased refactor plan with visual system, component system, and Definition of Done |

### 1.3. Additional Audits

| File | Purpose |
|---|---|
| `docs/admin-ui-density-audit.md` | Density audit |
| `docs/admin-search-filter-audit.md` | Search filter audit |
| `docs/admin-panel-saas-refactor.md` | SaaS refactor reference |
| `docs/ui-refactor-audit.md` | UI refactor audit |
| `docs/admin-ui-production-redesign.md` | Production redesign output |

### 1.4. Deploy

| File | Purpose |
|---|---|
| `deploy/README.md` | Deploy contract |

---

## 2. Key Findings from admin-ui-audit.md

### 2.1. Verified P0 Findings

All 7 P0 findings have been verified as fixed:

| ID | Area | Issue | Status |
|---|---|---|---|
| P0-01 | Conversations | Fake admin chat data removed | Verified Fixed |
| P0-02 | Table overflow | Wide tables contained | Verified Fixed |
| P0-03 | Access actions | Dangerous actions require confirm | Verified Fixed |
| P1-01 | Sidebar IA | Domain-based grouping | Verified Fixed |
| P1-02 | Dashboard | No fake metrics | Verified Fixed |
| P1-03 | User table | Operational columns | Verified Fixed |
| P1-04 | Logs | Request ID visible | Verified Fixed |

### 2.2. Remaining P2 Issues

| ID | Area | Issue | Files |
|---|---|---|---|
| P2-01 | Legacy copy | Some Vietnamese copy remains | Deep HR import wizard, authority management |
| P2-02 | Ant Design deprecations | Test warnings | `Spin.tip`, `Drawer.width`, etc. |
| P2-03 | HR page weight | Import wizard could be split | HREmployeesPage |

---

## 3. Visual System Target

### 3.1. Design Tokens

```scss
--app-bg: #e9e7e4;
--surface: #ffffff;
--surface-muted: #f7f7f8;
--border: #e8e8ec;
--text-primary: #111827;
--text-secondary: #6b7280;
--brand: #6f4cf6;     // restrained purple
--success: #15803d;
--warning: #d97706;
--danger: #dc2626;
--radius-card: 16px;
--radius-control: 10px;
--sidebar-width: 224px;
--topbar-height: 64px;
```

### 3.2. Typography

| Element | Size/Weight |
|---|---|
| Page title | 20px / 600 |
| Page subtitle | 13px / 400 |
| Body | 13-14px |
| Table text | 12.5-13px |
| Button text | 13px / 500 |

### 3.3. Layout Rules

- Sidebar: 224px fixed desktop
- Main padding: 24px desktop, 16px tablet
- Card gap: 16px
- Table row height: 44-52px
- Table header height: 36-40px
- Toolbar height: 40px

---

## 4. Component System

### 4.1. Layout Components
- `AdminShell`
- `AdminSidebar`
- `AdminTopbar`
- `PageHeader`
- `PageToolbar`

### 4.2. Data Display
- `StatCard`
- `DataTable`
- `StatusBadge`
- `SourceBadge`
- `AvatarCell`
- `DateTimeCell`
- `ActionMenu`

### 4.3. Feedback
- `EmptyState`
- `ErrorState`
- `Skeleton`
- `Toast`

### 4.4. Overlay
- `ConfirmDialog`
- `DetailDrawer`
- `FilterPopover`

---

## 5. Refactor Phases

| Phase | Content | Priority |
|---|---|---|
| Phase 1 | UI audit | Done |
| Phase 2 | Design tokens | Pending |
| Phase 3 | Admin Shell | Pending |
| Phase 4 | Shared components | Pending |
| Phase 5 | Dashboard | Pending |
| Phase 6 | User / HR pages | Pending |
| Phase 7 | Access Control | Pending |
| Phase 8 | Logs / Operations | Pending |
| Phase 9 | Error pages | Pending |
| Phase 10 | Verify | Pending |

---

## 6. Definition of Done (from REFACTOR_UI_PLAN.md)

Refactor is complete when:
- Chat desktop matches reference layout (pages 3/4/23/24/26/27)
- Side rail blue + module sidebar + main header shared
- Poll modal/card works
- Composer compact/rich works
- Empty welcome state appears when no chat selected
- Audio/video call state UI ready
- Auth/settings/toast follow design system
- Build passes
- No data flow regressions

---

**Last updated:** 2026-06-05
