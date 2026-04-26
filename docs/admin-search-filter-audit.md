# Admin Search / Filter Audit

Date: 2026-04-26

## Scope

This audit covers the current search and filter surfaces in `chat-admin-panel` after the
standardization pass. The pass kept existing API/query semantics and did not introduce client-only
filters where the backend contract does not support them.

## Standard Components

- `src/components/AdminSearchInput.tsx`: shared 34px search input with search icon, clear button,
  accessible label, restrained border, and brand-purple focus state.
- `src/components/CompactFilterBar.tsx`: compact one-row-first toolbar wrapper with controlled meta
  and chip area.
- `src/components/FilterBadge.tsx`: compact filter/status chip with removable state and semantic
  variants.
- `src/components/ActiveFilterChips.tsx`: active filter chip row with per-chip remove and `Clear all`.
- `src/components/AdvancedFilterPopover.tsx`: shared advanced filter trigger using the existing Ant
  Design popover pattern.
- `src/components/FilterSelect.tsx`: compact Ant Select wrapper for toolbar filters.
- `src/components/FilterDateRange.tsx`: compact Ant RangePicker wrapper for date filters.
- `src/styles/classic-admin.css`: final search/filter styling layer for height, focus, wrapping,
  chip colors, and responsive behavior.

## Page Audit

| Page                               | Before                                                                            | After                                                                                                                                                                                           | Files                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Dashboard `/`                      | Uses `TimeRangePicker`; no table search.                                          | Left unchanged because it is a real metrics time-range control, not a table filter.                                                                                                             | `src/features/dashboard/pages/DashboardPage.tsx`                            |
| Users `/users`                     | Inline Ant `Input`, `Select`, raw `Popover`, and generic active-count chips.      | Uses `AdminSearchInput`, `FilterSelect`, `AdvancedFilterPopover`, `CompactFilterBar`, and removable `ActiveFilterChips`. Search clear resets query; presence/activity stay in advanced popover. | `src/features/users/pages/UsersPage.tsx`                                    |
| User Detail `/users/:id`           | No table search/filter surface.                                                   | Left unchanged.                                                                                                                                                                                 | `src/features/users/pages/UserDetailPage.tsx`                               |
| HR Employees `/hr-employees`       | Inline Ant search/select, large read-only notice card, generic active-count text. | Uses shared search/select/chips; read-only state is a compact header chip.                                                                                                                      | `src/features/hr-employees/pages/HREmployeesPage.tsx`                       |
| Authority `/authority`             | Inline Ant search and mixed-language filter buttons/meta.                         | Search bar uses shared input/chips; Apply/Reset copy normalized in the primary toolbar.                                                                                                         | `src/features/authority/pages/AuthorityPage.tsx`                            |
| Access Requests `/access-requests` | Inline search/status controls and text-only active count.                         | Uses shared search/select/chips. Status badge colors distinguish pending/approved/rejected.                                                                                                     | `src/features/access/pages/AccessRequestsPage.tsx`                          |
| Audit Logs `/audit`                | Inline Ant search fields plus raw popover/date picker and text-only active count. | Uses shared search inputs, advanced popover, date range wrapper, and removable chips for action/user/service/target/date.                                                                       | `src/features/audit/pages/AuditLogPage.tsx`                                 |
| System Logs `/logs`                | Inline Ant search/select controls, old placeholder, and generic chips.            | Uses shared search/select/chips. Search keeps debounce semantics and clear resets debounced query immediately.                                                                                  | `src/features/system-logs/pages/SystemLogsPage.tsx`                         |
| Conversations `/conversations`     | Inline search/select and meta text.                                               | Uses shared search/select/chips without adding unsupported type/date filters.                                                                                                                   | `src/features/conversations/pages/ConversationsPage.tsx`                    |
| Monitoring `/monitoring`           | Uses `TimeRangePicker`; no service table search.                                  | Left unchanged; no supported service search API on this page.                                                                                                                                   | `src/features/monitoring/pages/MonitoringOverviewPage.tsx`                  |
| Services Health `/services/health` | URL `service` focus was shown as generic shell chip.                              | Uses `FilterBadge` for the supported URL focus filter; no new fake service search added.                                                                                                        | `src/features/services/pages/ServicesPage.tsx`                              |
| Settings `/settings/:section`      | Form-driven settings screens, not table filter pages.                             | Left unchanged except existing shared density styles.                                                                                                                                           | `src/features/settings/pages/SettingsPage.tsx`, service settings components |

## Badge Variants

- `success` / `status`: active, approved, online, healthy.
- `warning`: pending, warning, inactive.
- `danger` / `level`: rejected, error, failed.
- `neutral`: search text, disabled, unknown, date-neutral state.
- `role` / `scope`: permission, role, scope.
- `department` / `date`: department/unit and date-range chips.
- `service` / `source` / `type` / `info`: service/source/type/info filters.

## Filters Not Added

- Users: role, department, and HR-linked filters were not added because the current list query does
  not expose those backend filter params. The table still displays the columns honestly.
- HR Employees: department, unit code, and linked-user filters were not added because the current
  list query uses keyword/status only.
- Access Requests: source, scope, rule, and expiration filters were not added because the current
  request list call only sends status plus keyword mapped to IP/email.
- Audit Logs: level and request-ID dedicated filters were not added because the current audit query
  has action, actor email, entity type, source, and date range only.
- Conversations: type and date filters were not added because the current page/API supports backend
  search plus local status filtering only.
- Monitoring/Services: no new search UI was added where there is no supported API contract. Services
  only keeps the existing URL `service` focus state.

## Verification Result

- `npm run lint`: pass.
- `npm run build`: pass. This includes `tsc --noEmit`; `package.json` has no separate
  `typecheck` script.
- `npm run test`: pass, 10 test files and 30 tests.
- Build warning: existing Vite chunk-size warning remains.
- Test warnings: existing Ant Design/jsdom deprecation warnings remain and do not fail tests.

## Manual QA Checklist

- Search clear button removes text and resets the query/filter where that filter was active.
- Submit-based pages still require Apply where they did before.
- Realtime/debounced pages (`/logs`, `/conversations`) do not spam API beyond existing debounce or
  deferred-value behavior.
- Active filter chips show `Search`, `Status`, `Level`, `Service`, `Date`, `User/IP`, or `Target`
  labels with readable values.
- Per-chip remove works; `Clear all` is shown only when there are at least two active filters.
- Long department/service/status/search values truncate inside chips instead of stretching the page.
- Toolbar stays one row on normal desktop widths and wraps to controlled rows on tablet/mobile.
- Loading/error/empty states stay in table cards and do not cause page-level horizontal overflow.
