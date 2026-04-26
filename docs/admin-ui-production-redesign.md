# Admin UI Production Redesign

Date: 2026-04-26

## Before / After

Before: the admin panel had useful backend integration, but several surfaces still felt like internal developer tooling: mixed IA, long page copy, uneven table columns, fake conversation data, and inconsistent handling of long logs/messages.

After: the core admin experience is table-first and production-oriented. The shell uses clearer domain navigation, the dashboard focuses on real operating data, Users/Access/Logs use stable table layouts, and unsupported metrics or contracts are shown as unavailable instead of being faked.

## Components Created / Updated

Created:

- `src/components/AvatarCell.tsx`
- `src/components/MetaCell.tsx`
- `src/components/DateTimeCell.tsx`
- `src/components/SourceBadge.tsx`
- `src/components/DashboardCard.tsx`
- `src/components/TableSkeleton.tsx`
- `src/components/CardSkeleton.tsx`
- `src/components/PermissionDeniedState.tsx`
- `src/components/RateLimitState.tsx`
- `src/components/DetailDrawer.tsx`
- `src/components/ActionMenu.tsx`
- `src/features/errors/NotFoundPage.tsx`

Updated:

- `AdminTopbar`
- `navigationConfig`
- `CommandPalette`
- `RequireRole`
- `DashboardPage`
- `UsersPage`
- `AccessRequestsPage`
- `AuditLogPage`
- `SystemLogsPage`
- `ConversationsPage`
- `conversationsClient`

## Routes / Pages Refactored

- `/`: System Overview dashboard.
- `/users`: User Management table and detail inspector.
- `/hr-employees`: HR Employees table, filters, import/create actions, and existing detail drawer workflow.
- `/access-requests`: Admin Access Control summary, table, and confirmed drawer actions.
- `/audit`: Audit Logs table with request ID and detail drawer.
- `/logs`: System Logs table with request ID copy and detail drawer.
- `/conversations`: Admin table layout, no fake local data.
- `*`: real 404 page.

## Theme / Tokens

Updated:

- `src/styles/tokens.css`
- `src/styles/classic-admin.css`
- `src/theme/tokens.ts`

Added/standardized tokens for:

- app background
- surface / muted surface
- border
- text primary / secondary / muted
- purple brand / hover / soft
- success / warning / danger / info
- card/control/pill radius
- sidebar width
- light shadow
- stable table and toolbar sizing

## What Was Addressed

- Layout stability: shell, page padding, table shell overflow, table row sizing.
- Sidebar: grouped by Dashboard, Identity, Chat System, Access Control, Operations.
- Dashboard: real API-backed KPI cards and honest unavailable metric states.
- Data table: stable columns, horizontal scroll inside table shells, row action menu, detail panels.
- Loading/error/empty: existing query states retained, new 404/permission/rate-limit primitives added.
- Responsive: table overflow is contained; toolbar fields wrap to full width on small screens.
- Text overflow: shared `AvatarCell`, `MetaCell`, `DateTimeCell`, and CSS truncation for long row content.

## Known Limitations

- `Failed Logins` has no current frontend-visible metric endpoint, so the dashboard shows `No metrics available yet`.
- Conversation admin endpoints were not found in `chat-admin-service`; the client now calls the admin API boundary and will show a real backend error if the contract is absent.
- Some lower-traffic legacy pages still have older localized copy and older card patterns.
- Build still emits the existing Vite large chunk warning.

## API / Metrics Not Available

- Failed login metric.
- Conversation admin list/messages endpoint in `chat-admin-service`.
- User list does not return department or role directly; the table shows the gap instead of doing N+1 queries or inventing values.
- Conversation created date, type, member count, status sequence fields are not in the current frontend type.

## Manual QA Checklist

- Open `/` at 1366, 1440, and 1920 widths; KPI cards should stay in a stable grid.
- Open `/users`; table should scroll inside the card and the detail panel should not shift the shell.
- Open `/access-requests`; approve/reject/revoke should only happen through confirmed drawer actions.
- Open `/audit` and `/logs`; long metadata/logs should stay in detail panels.
- Open `/conversations`; if backend is absent, error state should be honest and not show sample rows.
- Open an unknown route; 404 page should show Back and Go Dashboard actions.
- Check tablet/mobile widths; sidebar should use overlay behavior and tables should scroll horizontally inside cards.
- Verify icon-only buttons have accessible labels.

## Verification Result

- `npm run lint`: pass.
- `npm run build`: pass. This includes `tsc --noEmit`; the repo has no separate `typecheck` script.
- `npm run test`: pass, 10 test files and 30 tests.
- `npm run check`: pass. Vite still reports the existing large chunk warning.
