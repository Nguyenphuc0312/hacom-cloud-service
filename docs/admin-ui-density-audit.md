# Admin UI Density Audit

Date: 2026-04-26

## Scope

Reviewed the production-admin density of the main routes and shared primitives against `REFACTOR_UI_PLAN.md`, `docs/admin-ui-audit.md`, and the current implementation under `src/app/layout`, `src/components`, and `src/features/**/pages`.

## Route Findings

| Route | Finding | Files | Fix Applied / Direction |
| --- | --- | --- | --- |
| `/` | Dashboard cards were already real-data/empty-state based, but shared card and KPI spacing could still read like a demo dashboard on shorter screens. | `src/features/dashboard/pages/DashboardPage.tsx`, `src/styles/classic-admin.css` | Added final density CSS for card padding, KPI height, grid gaps, title/meta truncation, and chart/skeleton height limits. |
| `/users` | Toolbar had search plus three filters inline, causing early wrapping at 1366px. The old inline detail panel reserved a blank side column before selection. | `src/features/users/pages/UsersPage.tsx` | Kept search and account status visible; moved presence/activity into an Advanced popover. Detail now opens in a modal overlay and read-only release warning is a compact chip. |
| `/users/:id` | Route exists as detail workflow; table route still uses side detail panel for quick inspection. | `src/features/users/pages/UserDetailPage.tsx`, `UsersPage.tsx` | No API or route change. CSS reduced detail-panel padding and code/detail section gaps. |
| `/hr-employees` | Table had a direct `Provision` action column, increasing width and row action noise. Detail drawer copy had mixed/mojibake labels and duplicated action explanation. | `src/features/hr-employees/pages/HREmployeesPage.tsx`, `src/features/hr-employees/components/HrEmployeeDetailDrawer.tsx` | Removed the `Provision` table column. Provisioning now stays in the detail drawer footer with confirm/loading/error behavior from `ProvisionAccountButton`. Drawer copy is concise English and reduced to two cards. |
| `/authority` | Page is card/form oriented rather than table-first. Risk is mostly card spacing, not business logic. | `src/features/authority/pages/AuthorityPage.tsx`, `src/styles/classic-admin.css` | Shared card/detail density CSS applies. No authority contract changes. |
| `/access-requests` | Summary cards were useful but vertical space was high; table also carried `Normalized IP` and `First Seen` columns that are better as detail data for compact scanning. | `src/features/access/pages/AccessRequestsPage.tsx` | Table now shows IP, scope, status, source, matched rule, last seen, expires at, actions. Normalized IP and first seen moved into drawer detail. Dangerous decisions remain drawer actions with confirm. |
| `/audit` | Toolbar had action, actor, service, target, and time range inline, which can wrap and push the table down. The old inline detail panel also reserved a blank column when no row was selected. | `src/features/audit/pages/AuditLogPage.tsx` | Kept action and actor visible; moved service, target type, and time range into an Advanced popover. Audit detail now opens in a modal overlay, so the table keeps full width. |
| `/logs` | Table and detail content were honest about raw payloads, but the old inline detail panel reserved a blank side column before selection. Pagination also showed too few rows for a logs page. | `src/features/system-logs/pages/SystemLogsPage.tsx` | Detail now opens in a modal overlay, table keeps full width, search/filter toolbar uses compact chips, and default page size is 12. |
| `/conversations` | No fake local conversation data found in the page. Detail panel contains message table; rows do not render full transcripts. | `src/features/conversations/pages/ConversationsPage.tsx` | Shared density CSS applies. Future improvement: convert inline `DetailPanel` to `AppDrawer` if table width remains tight on 1024px. |
| `/monitoring` | Operational KPI cards are real-data backed but still benefited from smaller card height and shorter meta surfaces. | `src/features/monitoring/pages/MonitoringOverviewPage.tsx`, `src/styles/classic-admin.css` | Shared metric/card density CSS applies. No fake chart introduced. |
| `/services/health` | Table-first page is acceptable; toolbar/meta could occupy less vertical space. | `src/features/services/pages/ServicesPage.tsx`, `src/styles/classic-admin.css` | Shared table shell, toolbar, pagination, and meta truncation CSS applies. |
| `/settings/:section` | Settings nav and content are not table-first by nature. Nav descriptions and cards can consume room. | `src/features/settings/pages/SettingsPage.tsx`, `src/styles/classic-admin.css` | Settings nav width reduced and long nav descriptions clamp to one line. Shared card padding reduced. |
| `/access` | Access-state UI is status-first rather than table-first. Density risk is low. | `src/features/access/pages/AccessStatusPage.tsx`, `AccessPendingPage.tsx` | Shared card/error state density applies. No access logic changes. |
| `/login` | Login card is intentionally centered. Density risk is lower than admin pages. | `src/features/auth/pages/LoginPage.tsx`, `src/styles/classic-admin.css` | Shared surface and background ownership applies. |
| `*` | 404 route already renders a real page with actions. | `src/app/router.tsx`, `src/features/errors/pages/NotFoundPage.tsx` | No route change. Shared compact error/empty state styling applies. |

## Component Findings

| Component | Issue | Fix Applied / Direction |
| --- | --- | --- |
| `PageHeader` / `PageShell` | Header copy can visually take too much vertical space if descriptions grow. | CSS now enforces compact header gap, 20px title, and one-line truncated subtitle on desktop. |
| `FilterBar` | Inline filters can push tables down. | Users and Audit moved secondary filters into Advanced popovers. CSS reduced filter padding/gap and added popover layout classes. |
| `DataTableShell` | Header padding and meta copy could compete with table content. | CSS reduced header padding and clamps meta to one line on desktop. |
| `AdminTable` / `DataTable` | Table was already contained, but row/header density could be tighter. | CSS reduced header/body cell padding while keeping 46px rows, contained horizontal scroll, and clear pagination. |
| `RowActionsDropdown` | Pattern is good and should remain the row-action default. | No code change; density CSS keeps action button compact. |
| `DetailPanel` / `AppDrawer` / `Modal` | Inline detail panels can reduce table width. Audit, Users, and Logs no longer use inline detail. | Audit/User/Log detail now uses modal overlays. Remaining inline panels are compacted; future improvement is to migrate them to `AppDrawer` or modal route-by-route. |
| `StatCard` / `MetricCard` / `DashboardCard` / `SurfaceCard` | Card min-height and padding were the main source of dashboard/admin whitespace. | Final CSS layer reduces card padding, KPI height, title size, gaps, and meta text overflow. |
| Chart surfaces | No fake chart data was introduced. Legacy chart skeleton heights were taller than needed. | CSS caps chart/skeleton height to 220-280px. |

## Actions Moved Or Kept In Modal / Drawer

- HR provisioning is no longer a table column; it is available in the HR employee drawer footer and still uses `Modal.confirm` inside `ProvisionAccountButton`.
- HR create/edit remains a modal form.
- HR deactivate remains a confirm dialog from the row dropdown.
- Access approve/reject/revoke remains inside the access detail drawer with `Popconfirm` and loading state.
- User lock/unlock/session revoke remains inside the user detail inspector with `Popconfirm`.
- Audit detail opens in a modal; before/after payload remains in `JsonDiffDrawer`; metadata remains out of rows.
- System log detail opens in a modal; raw message and metadata remain out of rows.

## Chart Review

- Dashboard and monitoring do not invent chart data.
- Current chart/skeleton height is capped by CSS to avoid pushing tables or recent activity too far down.
- Missing metrics continue to show empty states rather than fake charts.

## Responsive Density Checklist

- 1920x1080: main pages should keep header/toolbar compact and show table surfaces high on the viewport.
- 1440x900: Users/Audit advanced filters should keep toolbar near one row.
- 1366x768: Page header, toolbar, and table shell should leave the table as the dominant visible element.
- 1024x768: table horizontal scroll remains inside the card; inline detail panels collapse by existing layout rules.
- 768x1024: toolbar controls wrap, tables scroll inside cards, and subtitle/meta text can wrap.

Browser screenshot capture was not available in this CLI session, so the responsive items above are manual QA checks. Code-level layout containment and verification scripts were run separately.

## Known Limitations

- Conversations still uses inline `DetailPanel`. It is compacted, but converting it to `AppDrawer` or modal should be a separate low-risk pass because it owns URL/search/detail behavior.
- `AuthorityPage`, `HrImportWizard`, and older settings subcomponents can still receive a copy/density cleanup pass after this table-first pass.
- CSS ownership is improved through `classic-admin.css`, but old `global.css`, `foundation.css`, and `production.css` still exist. Further cleanup should be route-by-route after visual QA.
