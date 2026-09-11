# Chat Web Client Production Readiness Gate

This document is the Phase 10 release gate for chat runtime changes. It is
intended to be run before merging changes that affect messages, scroll,
realtime events, composer, upload, auth, or shared chat state.

## Automated Gate

Run locally:

```bash
npm run ci:readiness
```

This expands to:

```bash
npm run typecheck
npm run lint
npm run build:gate
npm test
npm run gate:static
```

Optional browser smoke:

```bash
npm run ci:readiness:e2e
```

Production performance smoke:

```bash
npm run test:e2e:perf
```

Focused chat runtime regression suite:

```bash
npm run test:chat-runtime
```

Static release checks:

```bash
npm run gate:static
```

The static gate fails when:

- removed legacy hooks/files return;
- removed dead dependencies return;
- production source uses raw `console.*` outside the logger;
- `MessageList` stops using `useConversationMessagesRTK` as its active
  message source;
- `useWebSocket` reintroduces Zustand writes for active messages.
- resource URL policy opens unsafe data URL handling.

The build gate fails when:

- production build fails;
- Vite emits circular chunk warnings;
- any emitted JavaScript asset exceeds the raw 500 kB budget.

## Required Automated Coverage

Unit coverage:

- message identity and optimistic/server matching;
- message ordering by `serverSeq` and `messageSeq`;
- message merge/dedupe;
- scroll controller priority and stale command cancellation;
- resource URL policy and token service storage behavior;
- upload object URL lifecycle.

Hook/component coverage:

- `useConversationMessagesRTK` initial load and RTKQ `loadOlder`;
- `MessageList` open-bottom and long-message render behavior;
- scroll controller load-older anchor and realtime append decisions;
- composer local draft/key press behavior;
- share contact stale search handling.

Integration coverage:

- optimistic send is visible immediately;
- REST ack and WebSocket race dedupe to one row;
- edit, delete, reaction, and read cursor patch RTKQ cache;
- jump target inserts/fetches through RTKQ cache;
- upload cancel/remove cleans up local resources.

## Manual QA Checklist

Authentication:

- Log in with a normal user.
- Log out and verify tokens/session clear.
- Force expired auth or 401 and verify redirect/cleanup behavior.

Conversation open and scroll:

- Open a conversation with 0 messages.
- Open a conversation with 1 message.
- Open a conversation with 100 messages and verify it settles at bottom.
- Open a conversation with 10k messages and verify it settles at bottom.
- Reopen a conversation while reading history and verify restore only when
  the latest message key has not changed.
- Switch conversations 20 times quickly and verify no old pending scroll
  command applies to the new conversation.

Realtime:

- Receive a message while at bottom and verify the list follows bottom.
- Receive a message while reading history and verify the viewport holds and
  the new-message affordance appears.
- Send a message while reading history and verify own message follows bottom.
- Disconnect/reconnect WebSocket and verify resync keeps order and dedupe.
- Verify sidebar unread/order updates without forcing a full message reload.

Message operations:

- Edit a message and verify the active timeline updates without refresh.
- Delete/revoke a message and verify order/sequence position is preserved.
- Add/remove reaction and verify the active row updates.
- Click a reply or search result for a message already in cache.
- Click a reply or search result for a message outside the loaded window.

History and large content:

- Load older messages multiple times and verify there is no scroll jump.
- Render a 20k character message.
- Render a long URL with no spaces and verify no horizontal page overflow.
- Load a slow image attachment and verify it does not jump to top/bottom.

Composer and upload:

- Type rapidly in composer with a 10k-message conversation open.
- Attach a file, remove it, and verify preview cleanup.
- Start upload and cancel it.
- Switch conversation with draft attachments and verify no leaked preview.

Responsive/mobile:

- Open chat on a narrow viewport.
- Focus composer and verify mobile keyboard does not hide input.
- Verify sidebar drawer/open state and active conversation selection.

## File Viewer P5 Release Checks

Build configuration:

- Confirm the image build received VITE_FILE_VIEWER_ENABLED and
  VITE_FILE_LIFECYCLE_TELEMETRY_ENABLED as literal true or false values.
- Confirm an unset or invalid value leaves both switches false.
- Confirm a runtime Compose/env-file change alone does not claim to change a
  baked Vite value.

Manual behavior:

- With the viewer false, verify an image/video thumbnail remains visible, the
  explicit download action works, and a chat file card does not open the
  in-app viewer.
- With the viewer true, verify the same chat file opens the in-app viewer and
  explicit download still works.
- With telemetry true, inspect chat:file-viewer-lifecycle and verify its
  serialized payload contains none of a fixture file name, local path, signed
  URL, token, identifier, or raw error.

Evidence status for this source change:

- Browser staging runtime: NOT_RUN.
- Browser end-to-end: NOT_RUN.
- Windows/Electron chosen-folder, native Office/default-app open, and reveal:
  NOT_RUN.
- Production deployment and telemetry-consumer validation: NOT_RUN.

These runtime checks remain release blockers even when the unit/type/build
checks pass.

## Debug Flags

Enable scroll decisions:

```bash
VITE_CHAT_SCROLL_DEBUG=true npm run dev
```

Enable performance markers:

```bash
VITE_CHAT_PERF_DEBUG=true npm run dev
```

Enable broader guarded logs in development only:

```bash
VITE_CHAT_DEBUG_LOGS=true npm run dev
```

## Current Readiness Score

Automated readiness after the current hardening pass:

- Architecture: 84/100
- State management: 82/100
- Chat correctness: 86/100
- Scroll/message rendering: 90/100
- Performance: 90/100
- UI/UX: 80/100
- Reliability: 84/100
- Security: 86/100
- Testing: 86/100
- Clean code: 88/100

Overall automated score: 86/100.

This is not a production sign-off score. Production sign-off remains blocked
until the target-environment manual QA pass and backend token/session decision
are recorded.

## Release Blockers

- Run and record a browser/manual pass for the checklist above on the target
  environment.
- Run target-environment Playwright/manual smoke with real auth and WebSocket.
- Confirm backend supports the hardened token/session mode expected by release.
