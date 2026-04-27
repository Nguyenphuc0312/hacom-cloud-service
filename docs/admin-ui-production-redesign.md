# Admin UI Production Redesign

Date: 2026-04-26

## Summary

The latest pass focused on production admin density: keep tables high in the viewport, reduce secondary UI footprint, move low-frequency filters into popovers, and keep sensitive or long-form actions in drawer/modal/confirm flows. API clients, route guards, auth/access logic, and backend contracts were not changed.

## Before / After

Before: the panel already had the SaaS admin shell and verified audit fixes, but several pages still spent too much vertical space on filters, summary cards, table meta copy, and row-level actions. HR detail copy also had mojibake/mixed-language labels.

After: main admin pages are denser and more table-first. Headers and toolbars are compact, table shells own overflow, card/KPI surfaces are smaller, HR provisioning is drawer-based, Access table columns are focused on scanning, and advanced filters no longer consume the primary toolbar.

## Files Changed

- Pages: `src/features/users/pages/UsersPage.tsx`, `src/features/audit/pages/AuditLogPage.tsx`, `src/features/access/pages/AccessRequestsPage.tsx`, `src/features/hr-employees/pages/HREmployeesPage.tsx`, `src/features/system-logs/pages/SystemLogsPage.tsx`.
- Drawers/actions: `src/features/hr-employees/components/HrEmployeeDetailDrawer.tsx`, `src/features/hr-employees/components/HrEmployeeDetailDrawer.test.tsx`.
- Styles/theme: `src/styles/classic-admin.css`.
- Docs: `docs/admin-ui-density-audit.md`, `docs/admin-ui-production-redesign.md`.

## Components Changed

- Search/filter standard components added: `AdminSearchInput`, `CompactFilterBar`, `FilterBadge`,
  `ActiveFilterChips`, `AdvancedFilterPopover`, `FilterSelect`, and `FilterDateRange`.
- `AdminSearchInput`: one compact 34px search treatment with icon, clear button, accessible label,
  and brand-purple focus.
- `ActiveFilterChips` / `FilterBadge`: shared active-filter display with semantic variants and
  per-chip remove.
- `CompactFilterBar`: table toolbar wrapper that keeps search/filter controls dense and wraps
  predictably.
- `FilterBar`: page usage was tightened by moving secondary filters into Ant Design `Popover` on Users and Audit.
- `DataTableShell` / `AdminTable` / `DataTable`: retained as the standard table system; density is improved through the final CSS layer.
- `RowActionsDropdown`: remains the row-action default; actions are still grouped behind a single menu button.
- `HrEmployeeDetailDrawer`: now uses concise English labels, two compact cards, and a drawer footer for refresh/provision actions.
- `StatCard`, `MetricCard`, `DashboardCard`, `SurfaceCard`: compacted through shared CSS padding/min-height/gap rules.

## Pages Refactored

- `/users`: visible toolbar reduced to search + account status + Advanced + Apply/Reset. Presence/activity filters moved to popover. Detail opens in a modal overlay and read-only release warning is a compact chip.
- `/hr-employees`: removed direct `Provision` table column; provisioning stays in detail drawer with confirm/loading/error behavior.
- `/access-requests`: table now prioritizes IP, scope, status, source, matched rule, last seen, expires at, and actions. Normalized IP and first seen moved to drawer detail.
- `/audit`: visible toolbar reduced to action + actor + Advanced + Apply/Reset. Service, target type, and time range moved to popover. Detail opens in a modal overlay so the table no longer reserves a blank side column.
- `/logs`: detail opens in a modal overlay; table keeps full width; page size increased to show more records by default; raw messages/metadata remain out of rows.
- `/conversations`: search/status toolbar now uses shared compact controls and active chips.
- `/authority`: primary search toolbar now uses the shared search input and active chip row.
- `/services/health`: supported URL service focus is shown with `FilterBadge`.
- Shared dashboard/monitoring/services/settings surfaces: compacted through common CSS instead of page-specific rewrites.

## Search / Filter Standardization

- Applied pages: `/users`, `/hr-employees`, `/authority`, `/access-requests`, `/audit`, `/logs`,
  `/conversations`, and `/services/health` for its existing URL service focus chip.
- Left unchanged by design: Dashboard and Monitoring `TimeRangePicker` controls, User Detail pages
  without table search, and Settings forms that are not table-filter surfaces.
- Badge variants standardized: success/status, warning, danger/level, neutral, role/scope,
  department/date, service/source/type/info.
- Unsupported filters were not invented: Users role/department/HR-linked, HR department/unit/linked
  user, Access source/scope/expiration/rule, Audit dedicated request-ID/level, Conversations
  type/date, and Monitoring/Services generic search remain unavailable until backend contracts
  expose them.
- Detailed audit: `docs/admin-search-filter-audit.md`.

## Design Tokens / Theme

- `src/styles/tokens.css` remains the CSS token source of truth.
- `src/theme/tokens.ts` remains the Ant Design token bridge.
- `src/styles/classic-admin.css` remains the final admin override layer and now includes a density section for page padding, toolbar height, table row/header density, card padding, KPI/card min-heights, chart/skeleton heights, and detail/code block overflow.

## CSS Ownership

- Token source of truth: `src/styles/tokens.css`.
- Ant theme bridge: `src/theme/tokens.ts`.
- Final admin override file: `src/styles/classic-admin.css`.
- Legacy layers still present: `src/styles/global.css`, `src/styles/foundation.css`, `src/styles/production.css`.
- Cleanup recommendation: keep future visual changes in `classic-admin.css` until older layer ownership can be split route-by-route. Do not delete legacy layers without browser QA because they still carry app-wide primitives.

## Density Changes

- Desktop page padding reduced to `20px 20px 24px`.
- Page header gap reduced; desktop subtitles truncate to one line.
- Toolbars now target 36px control height and tighter gaps.
- Table header/body padding reduced while keeping stable 46px rows.
- Table shell header/meta copy is clamped so the table remains the main surface.
- Card, stat, metric, dashboard, surface, and settings surfaces now use tighter padding and min-heights.
- Chart/skeleton surfaces are capped around 220-280px.
- Code/log blocks in detail views now have capped height with internal scroll.

## Modal / Drawer Actions

- HR provision: moved out of table column and kept in `HrEmployeeDetailDrawer` footer.
- HR create/edit: remains modal form.
- HR deactivate: remains confirm dialog from row dropdown.
- Access approve/reject/revoke: remains inside access drawer with confirmation and mutation loading state.
- User lock/unlock/revoke sessions: remains in user detail modal with confirmation.
- Audit detail: opens in a modal; before/after payload remains in `JsonDiffDrawer`.
- System log raw message/metadata: remains in detail modal.

## API / Metrics Missing

- Dashboard still does not fake charts or metrics when frontend-visible APIs are missing.
- User department/role gaps remain displayed as unavailable instead of N+1 frontend calls.
- Some conversation admin fields are still absent from current list API/types; the UI does not invent those values.

## Remaining P2 / P3 Limitations

- Conversations still uses an inline `DetailPanel`. It is compacted, but a later pass can migrate it to `AppDrawer` or modal.
- `AuthorityPage`, `HrImportWizard`, and older settings/service subcomponents can still receive a deeper copy/density pass.
- Ant Design deprecation warnings remain in tests for legacy props (`Drawer width`, `Spin tip`, `Space direction`, etc.). They do not fail lint/build/test.
- Vite still emits the existing large chunk warning.

## Manual QA Checklist

- `/`: dashboard cards compact, no fake chart, empty metrics honest.
- `/users`: table visible high in viewport; Advanced popover opens presence/activity filters; long email truncates; detail opens as modal.
- `/hr-employees`: table no longer has provision column; drawer shows profile/account state; provisioning confirm still works.
- `/access-requests`: table scans without normalized/first-seen columns; drawer still exposes those details; approve/reject/revoke require confirm.
- `/audit`: Advanced popover contains service, target type, and time range; detail opens as a modal; metadata and diff stay out of rows.
- `/logs`: table shows more rows; detail opens as modal; raw log/JSON scrolls internally.
- `/conversations`: no fake sample data; message preview stays clamped; detail panel does not render full transcript in rows.
- Search/filter QA: clear button, active chip remove, clear all, long chip truncation, desktop one-row
  toolbar, and tablet/mobile controlled wrapping.
- `/monitoring`, `/services/health`, `/settings/:section`: cards/toolbars stay compact and do not dominate the viewport.
- `/access`, `/login`, `*`: status/auth/error pages keep concise copy and clear actions.

## Responsive Checklist

- 1920x1080, 1440x900, 1366x768: header/toolbar/card spacing should leave tables as the dominant visible element.
- 1024x768: table horizontal scroll remains inside table cards; existing layout rules stack detail panels.
- 768x1024: toolbar controls wrap intentionally; subtitle/table meta can wrap instead of overflowing.

Browser screenshot capture was not available in this CLI session, so viewport checks are documented for manual QA. Code-level containment was verified by build/lint/test.

## Verification Result

- `npm run lint`: pass.
- `npm run build`: pass. This includes `tsc --noEmit`; there is no separate `typecheck` script in `package.json`.
- `npm run test`: pass, 10 test files and 30 tests.
- `npm run check`: not run separately because its component scripts were run individually. Build still emits the existing Vite large chunk warning.
