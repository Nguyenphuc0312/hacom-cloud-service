# Admin UI Audit

Date: 2026-04-26

## Stack

- Framework: Vite + React 19 + TypeScript.
- Router: `react-router-dom` in `src/app/router.tsx`.
- Server state: `@tanstack/react-query`.
- Local auth state: Zustand in `src/store/authStore.ts`.
- UI library: Ant Design 6 plus repo-owned wrappers in `src/components`.
- Icons: `lucide-react` through `src/components/AppIcon.tsx`.
- Styling: CSS files under `src/styles` plus Ant Design theme tokens in `src/theme`.

## Routes / Pages

- `/login`: `src/features/auth/pages/LoginPage.tsx`.
- `/access`: `src/features/access/pages/AccessPendingPage.tsx`.
- `/`: `src/features/dashboard/pages/DashboardPage.tsx`.
- `/users`: `src/features/users/pages/UsersPage.tsx`.
- `/users/:id`: `src/features/users/pages/UserDetailPage.tsx`.
- `/hr-employees`: `src/features/hr-employees/pages/HREmployeesPage.tsx`.
- `/authority`: `src/features/authority/pages/AuthorityPage.tsx`.
- `/access-requests`: `src/features/access/pages/AccessRequestsPage.tsx`.
- `/audit`: `src/features/audit/pages/AuditLogPage.tsx`.
- `/logs`: `src/features/system-logs/pages/SystemLogsPage.tsx`.
- `/conversations`: `src/features/conversations/pages/ConversationsPage.tsx`.
- `/monitoring`: `src/features/monitoring/pages/MonitoringOverviewPage.tsx`.
- `/services/health`: `src/features/services/pages/ServicesPage.tsx`.
- `/settings/:section`: `src/features/settings/pages/SettingsPage.tsx`.
- `*`: previously redirected to `/`; now uses `src/features/errors/NotFoundPage.tsx`.

## Existing Layout Components

- Shell: `src/app/layout/AdminShell.tsx`, `AdminSidebar.tsx`, `AdminTopbar.tsx`, `AppLayout.tsx`.
- Sidebar items: `SidebarNavSection.tsx`, `SidebarNavItem.tsx`, `navigationConfig.tsx`.
- Topbar: `TopbarSearch.tsx`, `TopbarActions.tsx`, `CommandPalette.tsx`.
- Page wrappers: `src/components/PageShell.tsx`, `PageHeader.tsx`, `PageContainer.tsx`.

## Existing Table / Card / Form Components

- Tables: `src/components/AdminTable.tsx`, `DataTableShell.tsx`, `DataTableToolbar.tsx`, `src/components/ui/DataTable.tsx`, `TablePagination.tsx`.
- Cards: `Card.tsx`, `StatCard.tsx`, `SummaryCard.tsx`, `WidgetCard.tsx`, `SurfaceCard.tsx`.
- Forms: `FilterBar.tsx`, `FormField.tsx`, `FormSection.tsx`, `FormActions.tsx`, `FormError.tsx`, `Input.tsx`.
- Feedback: `QueryStates.tsx`, `ui/EmptyState.tsx`, `ui/ErrorState.tsx`, `FeatureDisabledNotice.tsx`.
- Overlays/actions: `AppDrawer.tsx`, `DetailPanel.tsx`, `ConfirmDialog.tsx`, `RowActionsDropdown.tsx`, `JsonDiffDrawer.tsx`.

## Findings

| Priority | Group | Files | Impact | Fix |
| --- | --- | --- | --- | --- |
| P0 | Fake admin chat data | `src/api/clients/conversationsClient.ts`, `src/features/conversations/pages/ConversationsPage.tsx` | The page showed local sample conversations as if they were backend truth. This violated the no-fake-data rule. | Removed local sample data, routed through `adminAxiosInstance`, and refactored the page into an honest admin table/error state. |
| P0 | Table overflow risk | `src/components/AdminTable.tsx`, `src/components/ui/DataTable.tsx`, `src/styles/classic-admin.css` | Wide columns could make page-level horizontal overflow feel unstable. | Kept `scroll.x`, added table shell overflow containment, and standardized row height/text truncation. |
| P0 | Access actions lacked enough confirm surface | `src/features/access/pages/AccessRequestsPage.tsx` | Approve/reject/revoke were exposed from row actions too directly for security-sensitive operations. | Row actions now only open detail; dangerous decisions are confirmed in the drawer. |
| P1 | Sidebar IA was not aligned to product domains | `src/app/layout/navigationConfig.tsx` | Identity, chat, access, and operations were mixed, making daily operation harder. | Rebuilt IA into Dashboard, Identity, Chat System, Access Control, Operations using only existing routes. |
| P1 | Dashboard copy and metrics did not match the target plan | `src/features/dashboard/pages/DashboardPage.tsx` | The page read as a generic ops page and did not clearly identify missing metrics. | Refactored to `System Overview`, real KPI cards, real service health, and empty text for unavailable metrics. |
| P1 | Users table missed required operational columns | `src/features/users/pages/UsersPage.tsx` | Admins could not scan HR link, role gap, updated time, and account status in one stable table. | Added User, Employee Code, Email, Department, Role, Status, HR Linked, Updated At, Actions columns without extra API calls. |
| P1 | Logs table did not expose request IDs in the row | `src/features/system-logs/pages/SystemLogsPage.tsx`, `src/features/audit/pages/AuditLogPage.tsx` | Operators had to open detail for basic correlation. | Added Request ID columns and kept long JSON/log payloads in detail panels. |
| P1 | 404 route redirected silently | `src/app/router.tsx` | Bad URLs hid navigation mistakes and did not look like production admin. | Added a real 404 page with Back and Go Dashboard actions. |
| P1 | Tokens were not the requested warm light + restrained purple direction | `src/styles/tokens.css`, `src/theme/tokens.ts` | The previous visual system leaned blue and had multiple legacy gradients. | Added the requested semantic tokens and aligned Ant theme primary color to restrained purple. |
| P2 | Mixed English/Vietnamese legacy copy | Multiple pages, especially `AccessPendingPage.tsx`, older settings/services components | Copy consistency is not complete across every page. | Main refactored pages use concise operational English; remaining legacy pages are listed as follow-up. |
| P2 | HR page was heavier than the new table standard | `src/features/hr-employees/pages/HREmployeesPage.tsx` | It had the right data but carried long toolbar/table copy and mojibake labels. | Refactored to the shared table/header/filter style while preserving the HR import, detail drawer, and provisioning logic. |
| P2 | Legacy CSS layers overlap | `src/styles/global.css`, `foundation.css`, `production.css`, `classic-admin.css` | Multiple generations of styles make final visual ownership harder to reason about. | Added overrides in the last-loaded `classic-admin.css`; deeper cleanup should be incremental. |

## Most AI-Slop-Like Areas Before Refactor

- `ConversationsPage.tsx`: local hardcoded context and transcript-like UI made the admin route feel like a demo.
- `DashboardPage.tsx`: too much explanatory copy and not enough direct product dashboard framing.
- `AccessRequestsPage.tsx`: row-level decisions were too quick for a security-sensitive surface.
- `SystemLogsPage.tsx`: ASCII copy and missing request ID column reduced operator polish.
- Older CSS stack: several visual layers still existed from earlier refactors.
