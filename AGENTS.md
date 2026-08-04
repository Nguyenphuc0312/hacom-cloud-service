# AGENTS.md

## Scope

This file applies to `chat-web-client`.

Parent/root `AGENTS.md` defines global multi-repo rules. This file adds stricter rules for the production web chat client.

If there is a conflict:

1. Security rules win.
2. API/server truth rules win.
3. Chat correctness rules win.
4. Realtime recovery rules win.
5. UI stability and accessibility rules win.
6. This repo-level file wins over generic workspace style rules.

---

## Repository Role

`chat-web-client` is the Vite + React 19 + TypeScript single-page web client for the chat platform.

It owns:

- Web chat UI
- Conversation list UI
- Message list UI
- Message composer
- Realtime client integration
- Client-side routing
- Query/cache orchestration
- Local UI state
- Upload UX
- Notification UX
- Error/empty/limit states
- Production-grade responsive layout

It does not own backend truth.

The client must never become an independent source of truth for:

- messages
- unread count
- membership
- permissions
- account state
- block/friendship state
- upload finalization
- admin/auth decisions

Server APIs and realtime events define the contract. The UI must remain recoverable after reload and reconnect.

---

## Project Structure

Application code lives in `src/`.

Important folders:

- `src/components/`  
  Shared UI components.

- `src/pages/`  
  Route-level pages.

- `src/features/`  
  Feature slices and chat-domain UI modules.

- `src/router/`  
  Client routing.

- `src/store/` and `src/stores/`  
  Local UI state and existing global state modules.

- `src/services/`  
  API clients, websocket clients, service adapters.

- `src/utils/`  
  Pure helpers and utilities.

- `src/config/`  
  Runtime configuration and env mapping.

- `src/types/`  
  App-specific types.

- `src/theme/`  
  Theme tokens and styling helpers.

- `src/assets/`  
  Bundled static assets.

- `public/`  
  Public static assets.

- `e2e/`  
  Playwright browser tests.

- `deploy/`  
  Deployment assets.

- `nginx/`  
  Nginx/runtime serving config.

- `docs/`  
  UI, release, readiness, and operational docs.

Unit tests should sit near the implementation as:

```text
*.test.ts
*.test.tsx
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

Run local dev server, usually on port `5100`:

```bash
npm run dev
```

or:

```bash
make dev
```

Production build:

```bash
npm run build
```

Type check:

```bash
npm run typecheck
```

Lint:

```bash
npm run lint
```

Run unit tests:

```bash
npm test
```

Run focused chat correctness regression suite:

```bash
npm run test:chat-runtime
```

Run Playwright browser tests:

```bash
npm run test:e2e
```

Run readiness gate before larger changes:

```bash
npm run ci:readiness
```

Before using any command, inspect `package.json`. Do not invent scripts.

---

## Source-of-Truth Rules

The frontend is not the source of truth for chat data.

Backend truth owners:

- Auth/session/account truth: `chat-auth-service`
- Conversation/membership/read/upload capability truth: `chat-api-service`
- Message truth: MongoDB through chat API/runtime
- Realtime delivery: `chat-websocket-service`
- Projection/rebuild/retry: backend workers
- Shared contracts: `chat-shared-types`

Frontend may cache and render server-derived data, but must not invent durable truth.

Rules:

- Do not calculate canonical unread truth only in the client.
- Do not decide membership permission only in the client.
- Do not treat websocket delivery as final persistence confirmation.
- Do not treat optimistic messages as confirmed until server acknowledgment/reload contract confirms them.
- Do not hide backend authorization errors with fake success UI.
- After refresh/reconnect, the app must recover from backend APIs.

---

## Server State vs UI State

Separate server state from local UI state.

Server state includes:

- current user
- auth/session status
- conversations
- conversation members
- messages
- read checkpoints
- unread counts
- search results
- upload records
- permissions/capabilities
- notification state returned by backend

Local UI state includes:

- selected panel
- modal open/close
- draft input text
- composer height
- emoji picker state
- reply preview
- hover/focus state
- local scroll anchor
- temporary optimistic UI markers
- sidebar collapsed/responsive state if applicable

Rules:

- Server-derived state should be managed through query/cache patterns.
- WebSocket events should patch or invalidate canonical query keys.
- Local stores must not become hidden server truth.
- Do not duplicate the same server data in multiple stores without a clear ownership rule.
- Do not scatter message/unread/sidebar updates across unrelated components.
- Keep selectors stable.
- Avoid creating fresh objects/arrays in render-path selectors.
- Avoid broad global-store subscriptions that rerender the whole chat layout.

If migrating state architecture, do it intentionally and incrementally. Do not rewrite all state management during a small bugfix.

---

## Redux / RTK Query / Zustand Rules

If Redux Toolkit + RTK Query is used or introduced:

- Use RTK Query for server state and API cache.
- Use Redux slices only for cross-component UI state that truly needs global access.
- Keep ephemeral component state local where possible.
- Use WebSocket events to update/invalidate RTK Query cache consistently.
- Do not mirror RTK Query data into Zustand or another store.
- Do not keep duplicate conversation/message caches in multiple state systems.

If Zustand remains in a module:

- Use stable selectors.
- Avoid fresh objects in selectors.
- Use shallow comparison where appropriate.
- Keep stores small and domain-specific.
- Do not store derived backend truth as independent durable client truth.

---

## Chat Correctness Flow

For chat correctness work, trace the full flow before patching symptoms:

1. user action
2. REST request
3. backend persistence
4. response/ack
5. websocket broadcast
6. cache update
7. message render
8. sidebar update
9. unread/read update
10. reload behavior
11. reconnect/resync behavior

Rules:

- REST is the canonical send path.
- WebSocket supports realtime delivery and recovery signals.
- UI must work even if websocket event is delayed or missed.
- Reload must show the same persisted state.
- Reconnect must resync from backend APIs.
- Do not fix a render bug by hiding failed backend state.
- Do not make message visibility depend only on local optimistic state.

---

## Message Sending Rules

Message sending must preserve idempotency and reconciliation.

Rules:

- Use `clientMessageId` for optimistic send reconciliation where supported.
- Show optimistic state clearly.
- Reconcile server-confirmed message with optimistic message by identity, not by text/time guessing.
- Do not duplicate messages when REST response and websocket event both arrive.
- Do not lose messages when websocket arrives before REST response.
- Failed send must show retry/error state.
- Retried send must not create duplicate UI rows.
- Composer should not clear irreversibly before the send path is safely handled.
- Attachments must not appear as successfully sent until backend confirms the message/file attach contract.

---

## Message List and Virtualization Rules

Message list performance and scroll behavior are critical.

Rules:

- Use stable item keys.
- Prefer message identity plus `messageSeq` where available.
- Do not key message rows by array index.
- Preserve scroll anchor when older messages are prepended.
- Do not jump scroll when new messages arrive unless the user is already near bottom.
- New inbound messages should append smoothly.
- Loading older history must not lose current viewport.
- Message grouping must not break row identity.
- Date separators and system messages must have stable keys.
- Long messages must wrap safely.
- Long unbroken text must not cause horizontal overflow.
- Images/files must reserve layout space where possible to avoid jumps.
- Avoid full-list rerender on typing, hover, read receipt, or composer changes.
- Avoid measuring every row on every render.

Required behavior:

- Entering a conversation must load consistent history.
- F5/reload must not be required to see new persisted messages.
- Scroll-to-bottom affordance must appear when user is away from bottom.
- Sidebar ordering must update only from canonical latest message/activity signals.

---

## Conversation List / Sidebar Rules

Conversation list must be stable and production-grade.

Rules:

- Order by backend/projection latest activity contract.
- Do not reorder randomly from local timestamps.
- Preserve selection when data refreshes.
- Do not collapse/expand layout unexpectedly.
- Skeleton rows must reserve realistic height.
- Unread badges must come from server/projection state or documented cache update.
- New messages should update preview, time, unread, and ordering consistently.
- Hidden/deleted conversations should follow backend contract.
- Auto-unhide on new inbound message must be reflected through API/realtime contract.

---

## Read / Unread UI Rules

Backend owns read/unread truth.

Frontend rules:

- Mark-read should call the backend contract.
- Local read UI may update optimistically but must reconcile with backend state.
- Do not decrement unread blindly without checking conversation context.
- Do not mark read just because a message row rendered offscreen.
- Prefer viewport/active conversation intent for read behavior.
- Multi-device read state must reconcile from backend.
- Reconnect/reload must correct local unread state.

---

## Realtime / WebSocket Rules

WebSocket events are delivery signals, not durable truth.

Rules:

- WebSocket connect/reconnect must be explicit.
- Handle duplicate events idempotently.
- Handle out-of-order events safely.
- Handle missed events through resync.
- Do not assume websocket event means REST persistence succeeded unless contract says so.
- Do not create separate hidden websocket-only stores for messages/unread.
- WebSocket event handlers should update/invalidate canonical query/cache state.
- Always define what happens on:
  - disconnect
  - reconnect
  - token expiry
  - unauthorized websocket
  - duplicate event
  - stale event
  - event for inactive conversation
  - event for hidden/deleted conversation

Realtime events should carry and consume stable fields where available:

- `conversationId`
- `messageId`
- `clientMessageId`
- `messageSeq`
- `eventType`
- `actorId`
- `occurredAt`

---

## API Client Rules

API client code must preserve backend contracts.

Rules:

- Do not silently swallow API errors.
- Do not convert all backend errors into generic messages.
- Preserve request IDs where available for debugging.
- Keep auth errors distinct from validation, forbidden, rate-limit, and server errors.
- Do not mutate response shapes ad hoc inside components.
- Normalize response parsing in services/adapters.
- If backend response contract changes, update:
  - service adapter
  - shared types
  - tests
  - affected UI states
  - docs if needed

Important env variables may include:

- `VITE_API_BASE_URL`
- `VITE_AUTH_BASE_URL`
- `VITE_WS_BASE_URL`

Call out changes to these variables in PRs.

---

## Auth and Session UI Rules

Auth state belongs to backend/auth contracts.

Frontend rules:

- Do not trust role/permission from route params, localStorage, or request body.
- Do not show admin/user actions only because local UI state says so.
- Backend must enforce authorization.
- UI should display clear states for:
  - unauthenticated
  - expired session
  - forbidden
  - disabled account
  - pending admin access
  - rejected admin access
  - rate limited

- Token/session expiry must not leave the app in a broken half-authenticated state.
- Logout should clear local sensitive state and relevant caches.

---

## Upload and Attachment Rules

Upload UX must follow backend upload contract.

Rules:

- Prefer signed object-storage upload routes for new attachments.
- Do not add new dependency on legacy local `/uploads/*` paths.
- Show upload progress where supported.
- Show failed upload state clearly.
- Do not attach a file to a message until backend finalization/attach contract confirms it.
- Retried upload/send must not duplicate attachments.
- Large files, unsupported file types, and upload limits must have clear UI states.
- Attachment previews must not break message row layout.

---

## Notification Rules

Notification UX must be useful and not noisy.

Rules:

- Do not show duplicate notifications for the same event.
- Do not notify for messages in the active conversation if product behavior says they are already visible.
- Respect mute/hidden/conversation state from backend contract.
- Browser notification permission prompts must not appear unexpectedly.
- Notification state must recover after reload/reconnect.
- Error notifications should be actionable and not hide request failures.

---

## UI / UX Production Rules

Avoid AI-slop UI.

Rules:

- Prefer stable, classic, production chat layout.
- Avoid decorative cards/widgets that do not improve the workflow.
- Avoid oversized spacing, random gradients, generic dashboard visuals, and unstable animated surfaces.
- Use consistent spacing, typography, borders, and density.
- Keep the main chat layout visually firm under resize.
- Responsive behavior must not cause unexpected layout shifts.
- Loading skeletons must reserve realistic space.
- Error states must be clear and operationally useful.
- Empty states must be helpful but not noisy.
- Use tooltips for secondary explanations instead of cluttering primary UI.
- Do not hide important backend states behind vague copy.

Required pages/states where applicable:

- 403
- 404
- 429/rate limited
- generic error
- offline/reconnecting
- empty conversation
- empty search
- upload failed
- message send failed
- access pending/rejected

---

## Animation Rules

Animations should improve clarity, not create jank.

Rules:

- Keep animations short and subtle.
- Do not animate layout-critical containers in a way that shifts message rows.
- Avoid expensive animations on large message lists.
- Prefer transform/opacity over layout-affecting properties.
- Respect reduced-motion preferences.
- Realtime append should feel smooth without breaking scroll anchoring.
- Skeleton transitions must not cause visible reflow.

---

## Accessibility Rules

Chat must remain usable by keyboard and screen readers where practical.

Rules:

- Preserve visible focus states.
- Buttons and interactive icons need accessible labels.
- Modals must trap focus and restore focus on close.
- Escape should close transient overlays where expected.
- Message composer should support expected keyboard behavior.
- Do not remove semantic HTML for styling convenience.
- Color contrast must remain readable in primary states.
- Error messages should be associated with relevant inputs.

---

## i18n Rules

If the app uses i18n:

- Do not hard-code new user-facing strings inside components.
- Add missing translation keys.
- Keep keys stable and meaningful.
- Do not remove keys still used by routes/components.
- Fallback text must not leak raw technical errors to end users.
- Admin/debug text can be more technical only where appropriate.

---

## Styling Rules

Follow existing styling architecture.

Rules:

- Do not introduce a second design system without explicit approval.
- Prefer feature-local styles only when the pattern is not shared.
- Keep layout tokens consistent.
- Avoid one-off magic pixel values in core layout.
- Long text must use safe wrapping:
  - break long words/URLs
  - prevent horizontal overflow
  - preserve readable line length

- Message bubbles, composer, sidebar, and headers must stay stable across breakpoints.

---

## Coding Style and Naming

Use:

- TypeScript
- React function components
- 2-space indentation
- double-quote import style
- clear component and hook names

Naming:

- Components/pages: `PascalCase`
- Hooks: `useSomething`
- Stores: `*Store`
- Tests: named after the unit under test, for example `MessageInput.test.tsx`

Rules:

- Prefer feature-local helpers.
- Keep components focused.
- Extract complex effects into hooks.
- Avoid large components that mix API, websocket, rendering, and layout logic.
- Avoid unnecessary `useEffect`.
- Avoid render-path allocations for hot components.
- Avoid fresh objects/functions in memoized child props where it causes rerender issues.
- Do not use `any` for API payloads or shared contracts.
- Prefer types from `@hacom/chat-shared-types` where available.

---

## Testing Guidelines

Use Vitest with Testing Library for:

- components
- hooks
- stores
- service adapters
- chat runtime behavior

Use Playwright for:

- login flow
- conversation navigation
- send message flow
- realtime-like UI behavior
- scroll behavior
- upload flows
- error pages/states

Add nearby `*.test.ts` or `*.test.tsx` coverage when changing:

- state management
- API contracts
- message rendering
- virtualization
- scrolling
- composer/input behavior
- websocket event handling
- sidebar ordering
- unread behavior
- notification behavior
- auth/session UI
- route guards
- error states

Preserve `data-testid` contracts for:

- chat rows
- grouped messages
- message composer
- conversation rows
- important e2e selectors

Run targeted tests first, then broader checks for production-facing changes:

```bash
npm run lint
npm run typecheck
npm run build
```

For larger chat changes, also run:

```bash
npm run test:chat-runtime
npm run test:e2e
npm run ci:readiness
```

---

## Performance Rules

Hot paths:

- message list render
- conversation list render
- send message
- receive websocket event
- scroll older history
- typing in composer
- search
- upload progress
- notification handling

Rules:

- Avoid full chat layout rerender on each message event.
- Avoid rerendering the whole message list on composer typing.
- Avoid expensive selectors.
- Avoid unbounded arrays in memory for long conversations.
- Use pagination/infinite loading contracts.
- Use virtualization carefully and test scroll anchor behavior.
- Batch cache updates where appropriate.
- Debounce search input where appropriate.
- Cancel stale requests where supported.
- Avoid large synchronous work on the main thread.
- Do not parse/format large message sets repeatedly in render.

---

## Security Rules

- Never commit real secrets.
- Never log tokens, cookies, refresh tokens, or authorization headers.
- Never expose internal env/config values in UI.
- Do not store sensitive auth data unnecessarily.
- Do not trust client-side permission checks as security.
- Sanitize or safely render any user-generated HTML/markdown.
- Do not use `dangerouslySetInnerHTML` unless reviewed and sanitized.
- External links should be safe:
  - avoid opener leaks
  - validate URL rendering

- File previews must not execute untrusted content.
- Do not bypass CORS/auth behavior through unsafe client hacks.

---

## Documentation Rules

Update docs when changing:

- env variables
- API integration behavior
- websocket behavior
- state architecture
- route behavior
- production readiness gates
- deployment/nginx assumptions
- major UI/UX behavior
- error/access states

Docs must describe current implementation, not aspirational UI.

---

## Commit and Pull Request Guidelines

Use concise Conventional Commit-style subjects when possible:

```text
feat(chat): improve message scroll anchoring
fix(runtime): prevent duplicate optimistic messages
refactor(state): move conversations to RTK Query cache
test(chat): cover websocket reconnect resync
docs(env): document VITE_WS_BASE_URL
```

The first line should be imperative and scoped to one change.

PRs should include:

- root cause
- behavior change
- screenshots or recordings for UI changes
- affected routes/components
- affected API contracts
- affected websocket events
- env/config changes
- verification commands
- known rollout risks
- backend dependency notes

Call out changes to:

- `VITE_API_BASE_URL`
- `VITE_AUTH_BASE_URL`
- `VITE_WS_BASE_URL`
- proxy targets
- nginx config
- shared types

---

## Change Safety Checklist

Before completing a change, verify:

- Server truth is not duplicated as client truth.
- REST send path remains canonical.
- WebSocket handling is idempotent.
- Reload/reconnect behavior still works.
- Optimistic messages reconcile by identity.
- Sidebar ordering remains stable.
- Scroll anchor is preserved.
- Long messages do not break layout.
- Loading skeletons do not cause layout jumps.
- Error/empty/access states are handled.
- API/shared type impact is handled.
- Tests cover the changed behavior.
- Screenshots/recordings are included for visible UI changes.
- Commands were run or failures were reported honestly.

---

## Definition of Done

A `chat-web-client` change is not done until:

- It fixes the root cause, not only the symptom.
- It preserves backend source-of-truth ownership.
- It does not create hidden client truth.
- It keeps REST as the canonical send path.
- It handles websocket duplicate/missed/out-of-order events safely.
- It survives reload and reconnect.
- It avoids message duplication/loss.
- It preserves scroll stability.
- It preserves sidebar ordering.
- It handles loading, empty, error, 403, 404, and rate-limit states where relevant.
- It avoids AI-slop UI.
- It remains responsive without layout shifts.
- It is tested at the right level.
- Build/typecheck/lint status is known.
- Docs/env notes are updated when behavior changed.
