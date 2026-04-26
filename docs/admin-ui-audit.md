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
- `*`: `src/features/errors/NotFoundPage.tsx`.

## Layout Components

- Shell: `src/app/layout/AdminShell.tsx`, `AdminSidebar.tsx`, `AdminTopbar.tsx`, `AppLayout.tsx`.
- Sidebar items: `SidebarNavSection.tsx`, `SidebarNavItem.tsx`, `navigationConfig.tsx`.
- Topbar: `TopbarSearch.tsx`, `TopbarActions.tsx`, `CommandPalette.tsx`.
- Page wrappers: `src/components/PageShell.tsx`, `PageHeader.tsx`, `PageContainer.tsx`.

## Table / Card / Form Components

- Tables: `src/components/AdminTable.tsx`, `DataTableShell.tsx`, `DataTableToolbar.tsx`, `src/components/ui/DataTable.tsx`, `TablePagination.tsx`.
- Cards: `Card.tsx`, `StatCard.tsx`, `SummaryCard.tsx`, `WidgetCard.tsx`, `SurfaceCard.tsx`.
- Forms: `FilterBar.tsx`, `FormField.tsx`, `FormSection.tsx`, `FormActions.tsx`, `FormError.tsx`, `Input.tsx`.
- Feedback: `QueryStates.tsx`, `ui/EmptyState.tsx`, `ui/ErrorState.tsx`, `FeatureDisabledNotice.tsx`.
- Overlays/actions: `AppDrawer.tsx`, `DetailPanel.tsx`, `ConfirmDialog.tsx`, `RowActionsDropdown.tsx`, `JsonDiffDrawer.tsx`.

## Verified Claims

| Claim | Result | Code evidence |
| --- | --- | --- |
| Fake admin chat data removed | Verified | `src/api/clients/conversationsClient.ts` calls `adminAxiosInstance`; `src/features/conversations/pages/ConversationsPage.tsx` renders API state and no local sample transcripts. |
| Table overflow contained | Verified | `src/components/AdminTable.tsx` and `src/components/ui/DataTable.tsx` set horizontal scroll; `src/styles/classic-admin.css` contains table shell overflow and truncation rules. |
| Access decisions require confirm | Verified | `src/features/access/pages/AccessRequestsPage.tsx` row actions open detail; approve/reject/revoke are confirmed from the drawer. |
| Sidebar IA is domain-based | Verified | `src/app/layout/navigationConfig.tsx` groups Dashboard, Identity, Chat System, Access Control, Operations using existing routes only. |
| Dashboard is System Overview | Verified | `src/features/dashboard/pages/DashboardPage.tsx` uses `System Overview` and avoids fake metrics for unavailable data. |
| Users table has operational columns | Verified | `src/features/users/pages/UsersPage.tsx` contains User, Employee Code, Email, Department, Role, Status, HR Linked, Updated At, Actions. |
| Logs and audit show Request ID | Verified | `src/features/system-logs/pages/SystemLogsPage.tsx` and `src/features/audit/pages/AuditLogPage.tsx` include Request ID columns and detail panels for raw payloads. |
| 404 is a real page | Verified | `src/app/router.tsx` maps `*` to `NotFoundPage`; `NotFoundPage` includes Back and Go Dashboard actions. |
| Theme uses warm light + restrained purple | Verified with follow-up | `src/styles/tokens.css` and `src/theme/tokens.ts` own the palette; `src/styles/classic-admin.css` now neutralizes older page gradients at the final layer. |

## Findings

| Priority | Group | Files | Impact | Fix |
| --- | --- | --- | --- | --- |
| P0 | Fake admin chat data | `src/api/clients/conversationsClient.ts`, `src/features/conversations/pages/ConversationsPage.tsx` | Fake conversations violated backend truth ownership. | Verified removed; backend absence now surfaces honest error/empty states. |
| P0 | Table overflow risk | `src/components/AdminTable.tsx`, `src/components/ui/DataTable.tsx`, `src/styles/classic-admin.css` | Wide tables could create app-level horizontal scroll. | Verified contained; table shells own overflow and cells truncate/clamp. |
| P0 | Sensitive access actions | `src/features/access/pages/AccessRequestsPage.tsx` | Row-level approve/reject/revoke was too direct for security-sensitive operations. | Verified fixed; dangerous decisions require drawer confirm with loading/error handling. |
| P1 | Sidebar IA | `src/app/layout/navigationConfig.tsx` | Mixed domains made daily operation harder. | Verified fixed with product-domain sections and no empty routes. |
| P1 | Dashboard metrics | `src/features/dashboard/pages/DashboardPage.tsx` | Generic dashboard copy and unavailable metrics could mislead operators. | Verified fixed; no fake chart/metric for missing endpoints. |
| P1 | User Management table | `src/features/users/pages/UsersPage.tsx` | Admins needed one scan-friendly account/HR/status table. | Verified fixed without extra row-level API calls. |
| P1 | Logs correlation | `src/features/system-logs/pages/SystemLogsPage.tsx`, `src/features/audit/pages/AuditLogPage.tsx` | Request IDs were not visible enough for operations. | Verified fixed; long JSON/logs stay in detail views. |
| P1 | 404 behavior | `src/app/router.tsx`, `src/features/errors/NotFoundPage.tsx` | Silent redirect hid bad URLs. | Verified fixed. |
| P2 | Mixed legacy copy | `src/app/layout/*`, `src/components/*`, `LoginPage`, `AccessPendingPage`, `MonitoringOverviewPage`, `ServicesPage`, `SettingsPage` | Mojibake and mixed Vietnamese/English made the panel feel unfinished. | Fixed for shell, main pages, error/access copy, badges, command palette, and shared states. |
| P2 | HR page weight | `src/features/hr-employees/pages/HREmployeesPage.tsx`, `ProvisionAccountButton.tsx` | The HR page had table/action value but uneven copy and provisioning labels. | Kept backend logic and workflows, normalized page/header/table/actions to the shared admin style. |
| P2 | CSS layer overlap | `src/styles/global.css`, `foundation.css`, `production.css`, `classic-admin.css`, `tokens.css` | Older gradients/shadows could still leak into production pages. | `tokens.css` remains source of truth; final `classic-admin.css` overrides core admin surfaces. |

## Remaining Issues

- Some low-traffic feature-local components outside the main route pass still contain older Vietnamese copy, especially deeper HR import wizard copy and authority-management text.
- Ant Design 6 deprecation warnings remain in tests for `Spin.tip`, `Drawer.width`, `Card.bordered`, `Space.direction`, `Alert.message`, and old Tooltip props.
- `HREmployeesPage` still carries a full import wizard by design; a later pass can split import/provision flows further without changing backend contracts.

## Most AI-Slop-Like Areas Addressed

- Conversations no longer renders fake local samples.
- Dashboard now reads as a real operations overview instead of a generic demo dashboard.
- Access requests use confirmed drawer actions for dangerous decisions.
- Core tables use contained scroll and compact cells.
- Shell/topbar/sidebar copy is concise and operational.
