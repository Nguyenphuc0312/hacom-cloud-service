# AGENTS.md

## Scope

This file applies to `chat-admin-panel`.

Parent/root `AGENTS.md` defines global multi-repo rules. This file adds stricter rules for the Vite + React admin UI.

If there is a conflict:

1. Security rules win.
2. Backend API ownership rules win.
3. Admin access-control rules win.
4. API contract rules win.
5. UI stability and operator usability rules win.
6. This repo-level file wins over generic workspace style rules.

---

## Repository Role

`chat-admin-panel` is the Vite + React 19 + TypeScript admin UI for the chat platform.

It owns:

- Admin shell layout
- Admin routing
- Admin route guards
- Admin API client integration
- Admin dashboard pages
- User/session/admin management UI
- Access-control UI
- System logs UI
- SMTP settings UI
- Email template UI
- HR import/provisioning UI where implemented
- Admin table/filter/sort/pagination UX
- Error, empty, forbidden, pending, and rejected states

It does not own:

- Auth truth
- Admin access truth
- Chat conversation truth
- Message truth
- HR employee truth
- Backend authorization decisions
- SMTP secret truth
- System log truth

The UI must display backend state accurately and must not invent hidden truth.

---

## Project Structure

Application code lives under `src/`.

Important folders:

- `src/app/`  
  Routing, guards, providers, shell layout, app-level composition.

- `src/features/<domain>/`  
  Page-level feature modules. Keep domain-specific pages, components, hooks, and tests close together.

- `src/api/`  
  Axios clients, route helpers, API contracts, shared API types, response adapters.

- `src/components/`  
  Reusable UI primitives and shared components.

- `src/styles/`  
  Shared CSS and layout styles.

- `src/theme/`  
  Theme tokens, UI constants, and design variables.

- `src/test/setup.ts`  
  Shared Vitest/jsdom test setup.

- `public/`  
  Static assets.

- `deploy/`, `nginx/`, `Dockerfile`, `Makefile`  
  Deployment and runtime assets.

Tests should be colocated as:

```text
*.test.ts
*.test.tsx
```

Examples:

```text
SystemLogsPage.test.tsx
hrEmployeesClient.test.ts
AccessStatusPage.test.tsx
```

---

## Build, Test, and Development Commands

Install dependencies:

```bash
npm ci
```

or:

```bash
make install
```

Run local dev server on port `5174`:

```bash
npm run dev
```

or:

```bash
make dev
```

Build production bundle:

```bash
npm run build
```

or:

```bash
make build
```

Preview production bundle locally:

```bash
npm run preview
```

or:

```bash
make start
```

Lint:

```bash
npm run lint
```

or:

```bash
make lint
```

Run tests:

```bash
npm run test
```

Run full check:

```bash
npm run check
```

Before using any command, inspect `package.json`. Do not invent scripts.

---

## Backend Ownership Rules

The admin panel is a client. It must not become a backend authority.

Backend owners:

- `chat-admin-service` owns admin backend orchestration, SMTP settings, email templates, system logs, admin audit, and admin read models.
- `chat-auth-service` owns auth identity, session, token, account lifecycle, and admin access policy where implemented.
- `chat-api-service` owns chat business truth.
- `hr-api-service` owns HR employee truth.
- `chat-shared-types` owns shared contracts where used.

Rules:

- Do not hard-code backend truth in the UI.
- Do not decide authorization only in frontend state.
- Do not fake approved/pending/rejected access status.
- Do not hide backend access errors behind generic success UI.
- Do not call service endpoints through random ad-hoc URLs inside components.
- Do not bypass `src/api` clients for normal service calls.
- Do not create client-only copies of users, sessions, logs, SMTP settings, or HR employees as durable truth.

---

## Environment and Routing Rules

Use the existing env model.

Important variables:

```text
VITE_ADMIN_API_ROOT=/api/v1/admin
VITE_AUTH_BASE_URL=/api/v1/auth
```

Rules:

- `VITE_ADMIN_API_ROOT` points to admin API root.
- `VITE_AUTH_BASE_URL` points to auth API root.
- Service calls should use relative client paths where possible.
- Do not reintroduce `VITE_APP_BASE_PATH`.
- Production assets are built from host root `/`.
- Do not hard-code production domains inside source code.
- Proxy target changes must be documented.
- Env/deployment changes must be called out in PRs.
- Update `.env.example` or `.env.dev.frontend-with-develop.example` when config changes.

---

## API Client Rules

All API integration must be centralized under `src/api`.

Rules:

- Use typed Axios clients.
- Keep route helpers centralized.
- Keep response adapters close to API clients.
- Preserve backend response envelopes.
- Preserve request IDs where returned.
- Do not silently swallow API errors.
- Do not convert all errors into generic “failed” messages.
- Do not mutate backend response shape inside random components.
- Do not duplicate the same API request logic across pages.
- Do not infer success from HTTP 200 alone if the backend envelope says `success: false`.

When backend contract changes, update:

1. API client type.
2. Adapter/mapper.
3. Feature page state handling.
4. Tests.
5. Docs if behavior is operationally relevant.

Admin API errors should distinguish where possible:

- unauthenticated
- forbidden
- pending access
- rejected access
- source/IP mismatch
- upstream auth unavailable
- validation failure
- rate limited
- not found
- conflict
- internal error

---

## Auth and Access-Control UI Rules

Admin access-control is security-sensitive.

Rules:

- Route guards must protect admin pages.
- UI must never be the only enforcement point.
- Backend must enforce auth/access decisions.
- Do not trust role, permission, access status, or user ID from localStorage alone.
- Do not fake access status to unblock UI.
- Do not treat pending access as approved.
- Do not treat rejected access as generic forbidden.
- Do not hide source/IP mismatch from operator-facing screens.
- Logout/session expiry must clear sensitive local state and relevant caches.

Access states must have clear UI:

- loading access status
- unauthenticated
- approved
- pending
- rejected
- expired
- source/IP mismatch
- forbidden
- rate limited
- auth service unavailable

If `/auth/access/status` says approved but `/admin/*` returns pending/forbidden, the UI should expose enough safe diagnostics to identify mismatch without leaking secrets.

---

## Admin UI / UX Production Rules

Avoid AI-slop UI.

Rules:

- Prefer classic, dense, production admin layout.
- Prioritize clarity over decoration.
- Avoid random gradients, oversized cards, generic dashboard visuals, and decorative empty widgets.
- Use stable spacing, typography, borders, and table density.
- Keep shell layout firm under resize.
- Avoid layout shifts when filters, tables, modals, and drawers open.
- Use skeletons that reserve realistic space.
- Use tooltips for secondary explanations.
- Keep operational status visible but not noisy.
- Error states must be actionable.
- Empty states must be concise and useful.
- Do not hide important backend messages behind vague UI copy.

Required states where applicable:

- 403 forbidden
- 404 not found
- 429 rate limited
- pending access
- rejected access
- source/IP mismatch
- empty table
- empty search
- upstream service unavailable
- validation error
- save failed
- mutation conflict
- generic error

---

## Admin Shell and Routing Rules

The admin shell should be stable and predictable.

Rules:

- Keep navigation structure consistent.
- Preserve current route on refresh where applicable.
- Route guards must handle loading/auth/access states explicitly.
- Do not flash protected content before auth/access checks finish.
- Do not redirect in loops.
- Preserve query params for table filters where useful.
- Do not store sensitive route state in URL.
- 403/404/error pages must look like real production admin pages, not placeholders.

---

## Tables, Filters, and Pagination Rules

Admin table UX is critical.

Rules:

- Pagination must follow backend contract.
- Sorting must follow backend contract.
- Filtering must follow backend contract.
- Search inputs should debounce where appropriate.
- Preserve filter/sort/page state when navigating back where useful.
- Do not load unbounded tables.
- Do not render huge lists without pagination/virtualization.
- Avoid N+1 API calls per row.
- Keep column widths stable.
- Long text must truncate or wrap intentionally.
- Use tooltips or detail drawers for secondary data.
- Row actions must be explicit and confirm destructive operations.
- Bulk actions must show selected count and clear success/failure states.

---

## User / Session Management UI Rules

For user and session admin pages:

- Display backend state accurately.
- Do not infer account status from UI-only fields.
- Disabled/locked/tombstoned states must be visually clear.
- Session revocation/logout actions must confirm target scope.
- User search must respect backend fields and pagination.
- Do not show stale HR/profile fields as canonical unless backend marks them as such.
- If HR-linked fields are displayed, label them clearly:
  - employee code
  - HR full name
  - HR email
  - department
  - unit
  - position
  - linked user

---

## Access-Control Page Rules

For admin access pages:

- Show current status clearly.
- Show safe client IP/source information when backend provides it.
- Show request existence and resubmit capability when available.
- Show pending/rejected/expired states distinctly.
- Do not auto-resubmit access requests without user intent.
- Respect backend `pollAfterMs` if polling is supported.
- Stop or slow polling when page is hidden where appropriate.
- Do not spam access status endpoint.
- Display safe request ID/debug info for operator support.

---

## System Logs UI Rules

System logs are operator-facing.

Rules:

- Use bounded pagination.
- Preserve filters in URL where useful.
- Support time range filters where backend supports them.
- Do not expose logs to unauthorized users.
- Mask sensitive values if displayed.
- Never display raw tokens, cookies, service secrets, SMTP passwords, or authorization headers.
- Use readable severity/status badges.
- Allow copy of request ID where useful.
- Avoid dumping raw JSON as the primary UI unless inside a detail view.

---

## SMTP Settings UI Rules

SMTP settings are sensitive.

Rules:

- Never display raw SMTP passwords/secrets.
- Mask secret fields.
- Make it clear when a secret is unchanged.
- Do not send empty secret fields as overwrite unless user explicitly clears them.
- Validate required fields before submit.
- Show test email result clearly.
- Do not expose internal mail runtime export secrets to browser UI.
- Confirm risky changes if they affect production email sending.
- Show audit/status info where backend provides it.

---

## Email Template UI Rules

Email template editing must be safe and predictable.

Rules:

- Validate required placeholders.
- Show available variables/placeholders.
- Do not allow unsafe script execution.
- Preview must be sanitized.
- Save failures must preserve draft content.
- Destructive reset/delete actions must require confirmation.
- Template status must reflect backend state.

---

## HR Import / Provisioning UI Rules

If HR import/provisioning exists in this panel:

- HR truth belongs to `hr-api-service`.
- Auth user truth belongs to `chat-auth-service`.
- Admin panel only displays and triggers documented backend workflows.
- Do not infer provisioning success before backend confirms it.
- Import results must show:
  - created
  - updated
  - skipped
  - failed
  - validation errors

- Large imports must show progress or clear processing state.
- Never display sensitive personal data beyond what the admin role is allowed to see.
- Search/filter behavior must follow backend contract.

---

## State Management Rules

Separate server state from UI state.

Server state:

- current admin user
- auth/access status
- users
- sessions
- logs
- SMTP settings
- email templates
- HR import results
- backend config/status

Local UI state:

- modal open/close
- selected rows
- table density
- active tab
- form draft values
- temporary filter input
- drawer open/close
- local optimistic mutation markers

Rules:

- Do not duplicate server state into multiple stores.
- Prefer query/cache patterns for server state.
- Keep local state close to the component when possible.
- Do not store sensitive data in localStorage unless explicitly designed.
- Mutations must invalidate or patch relevant cached queries.
- Failed mutations must rollback optimistic UI where applicable.
- Keep selectors stable.
- Avoid render-path fresh objects that cause unnecessary rerenders.

---

## Form and Mutation Rules

Admin forms must be safe.

Rules:

- Validate before submit.
- Surface field-level errors where possible.
- Preserve user input on failed submit.
- Disable duplicate submit while pending.
- Show success state only after backend confirms success.
- Confirm destructive actions.
- Show conflict errors clearly.
- Do not hide validation errors inside toast-only UX.
- Do not send fields the backend does not expect.
- Do not silently drop fields from backend response if they affect operator understanding.

---

## Styling Rules

Use existing styling architecture.

Rules:

- Use `src/styles` and `src/theme` for shared styling/tokens.
- Do not introduce a second design system without explicit approval.
- Prefer consistent admin density.
- Avoid one-off magic pixel values in core layout.
- Keep sidebar/header/content layout stable.
- Long text must not break tables or cards.
- Responsive behavior must not shift core navigation unexpectedly.
- Admin pages should look like a serious production tool, not a generated demo.

---

## Accessibility Rules

Admin UI must remain usable.

Rules:

- Preserve keyboard navigation.
- Preserve visible focus states.
- Buttons/icons need accessible names.
- Modals/drawers must trap focus and restore focus on close.
- Forms need labels and useful validation messages.
- Tables should remain readable by assistive tech where practical.
- Do not remove semantic HTML for styling convenience.
- Color contrast must remain readable.

---

## Security Rules

- Never commit real secrets.
- Never log tokens, cookies, service secrets, SMTP secrets, or authorization headers.
- Never expose internal env/config values in UI.
- Never trust frontend-only authorization.
- Do not store raw JWTs or sensitive secrets unnecessarily.
- Do not use `dangerouslySetInnerHTML` unless content is sanitized and reviewed.
- Do not render unsafe template previews.
- External links should avoid opener leaks.
- File/import previews must not execute untrusted content.
- Do not bypass CORS/auth through unsafe client hacks.

---

## Coding Style and Naming

Use:

- TypeScript with strict compiler settings
- React function components
- `@/` imports for source paths
- single quotes
- semicolons
- trailing commas
- `printWidth: 100`

Naming:

- Components/pages: `PascalCase`
- Hooks: `useXxx`
- API clients: `xxxClient.ts`
- Feature folders: keep existing kebab-case convention
- Tests: named after the unit/page/client under test

Rules:

- Use consistent type imports.
- Keep components focused.
- Extract complex state/effects into hooks.
- Avoid unnecessary `useEffect`.
- Avoid `any` in API contracts.
- Prefer feature-local helpers.
- Keep API mapping outside visual components.
- Do not mix API calls, permission logic, and complex table rendering in one large component.

---

## Testing Guidelines

Use:

- Vitest
- Testing Library
- jsdom
- shared setup in `src/test/setup.ts`

Place tests next to code they cover.

Add regression tests for:

- API boundary changes
- auth/access flows
- route guards
- access pending/rejected/source mismatch states
- HR import/provisioning
- admin table filtering/sorting/pagination
- mutation success/failure states
- SMTP settings secret masking
- email template validation
- system log rendering/filtering
- error pages
- empty states

Useful commands:

```bash
npm run test
npm run lint
npm run build
npm run check
```

For targeted tests:

```bash
npm run test -- path/to/file.test.tsx
```

Preserve existing `data-testid` selectors used by tests unless updating tests intentionally.

---

## Performance Rules

Admin UI must remain responsive.

Rules:

- Avoid unbounded list rendering.
- Avoid N+1 API calls per row.
- Debounce search inputs where appropriate.
- Cancel stale requests where supported.
- Avoid expensive formatting inside table render loops.
- Memoize heavy column definitions where appropriate.
- Do not rerender whole admin shell on each table state change.
- Keep logs and large JSON payloads inside lazy/detail views.
- Use pagination for large data.
- Avoid polling too aggressively.

---

## Documentation Rules

Update docs when changing:

- env variables
- API integration behavior
- route behavior
- access-control UI behavior
- deployment/nginx assumptions
- admin table contracts
- HR import/provisioning behavior
- SMTP/email template behavior
- system log behavior

Docs must describe current implementation, not aspirational behavior.

---

## Commit and Pull Request Guidelines

Use concise Conventional Commit-style subjects when possible:

```text
feat(access): show source mismatch state
fix(api): preserve admin request id in errors
refactor(users): centralize table filters
test(logs): cover system log empty state
docs(env): document VITE_ADMIN_API_ROOT
```

The first line should be imperative and scoped to one change.

PRs should include:

- root cause
- behavior change
- affected routes/pages
- affected API contracts
- env/config changes
- screenshots or recordings for visible UI changes
- verification commands
- known rollout risks
- backend dependency notes

Call out changes to:

- `VITE_ADMIN_API_ROOT`
- `VITE_AUTH_BASE_URL`
- proxy targets
- nginx config
- deployment path/root behavior

---

## Change Safety Checklist

Before completing a change, verify:

- Backend ownership is respected.
- No client-only admin truth was introduced.
- Auth/access states are handled explicitly.
- API response envelope is preserved.
- Error/request ID behavior is preserved.
- Admin tables remain paginated/bounded.
- Sensitive values are masked.
- Route guards do not flash protected content.
- 403/404/429/error states are handled where relevant.
- Env/deployment impact is known.
- Tests cover changed behavior.
- Screenshots/recordings are included for visible UI changes.
- Commands were run or failures were reported honestly.

---

## Definition of Done

A `chat-admin-panel` change is not done until:

- It fixes the root cause, not only the symptom.
- It preserves backend source-of-truth ownership.
- It does not create hidden client truth.
- It does not weaken admin access-control.
- It does not leak secrets.
- It handles loading, empty, error, 403, 404, and rate-limit states where relevant.
- It keeps admin layout stable and production-grade.
- It avoids AI-slop UI.
- It preserves API contracts or updates all affected clients/tests.
- It is tested at the right level.
- Build/lint/test status is known.
- Docs/env examples are updated when behavior changed.
