# chat-web-client Memory Audit

Date: 2026-07-03

## Scope

Audited `chat-web-client` as the root web runtime used by the Electron thin client. Desktop was checked only after web-side leak/caching risks were traced.

## How Measured

- Package evidence: `package.json` scripts use `npm`; `package-lock.json` is present.
- Production-like command used:
  - `npm ci`
  - `npm run build`
  - `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173`
- Browser measurement fallback:
  - Browser plugin runtime was attempted first and returned `Browser is not available: iab`.
  - Fallback used Playwright Chromium with `--enable-precise-memory-info --js-flags=--expose-gc`.

## Baseline Results

Confirmed local production preview, unauthenticated login shell:

| Scenario | Result |
| --- | --- |
| App load | `usedJSHeapSize` 7,567,964 bytes; `totalJSHeapSize` 10,538,828 bytes |
| Idle 5 minutes | `usedJSHeapSize` 8,095,067 bytes; `totalJSHeapSize` 9,488,175 bytes |
| Visibility event | `usedJSHeapSize` 8,115,331 bytes; `totalJSHeapSize` 9,488,199 bytes |
| Console errors/warnings | 0 captured |

CHUA XAC MINH runtime because this environment had no authenticated chat session/test data:

- Open one large conversation.
- Switch across 20 conversations.
- Send/preview image/file/audio/location.
- Force WebSocket reconnect 5 times.
- Hidden then visible with active chat data.

## Confirmed Root Causes

### 1. Blob object URLs could be retained indefinitely

File: `src/lib/blobPreviewCache.ts`

Confirmed by code: the cache exists because `useUploadQueue.getReadyMeta()` creates an extra `URL.createObjectURL(draft.file)` so an optimistic image can stay visible after `acknowledgeSent()` revokes the draft preview URL. Without a bounded cache and TTL, a failed/missing thumbnail-ready event can keep Blob memory pinned.

Fix:

- `blobPreviewCache` is bounded to 32 entries.
- Entries expire after 10 minutes by default.
- Replacing, deleting, expiring, clearing, and LRU eviction all call `URL.revokeObjectURL`.
- `blobPreviewCache.clear()` exists for logout/cache reset.

Before/after:

- Before: no hard upper bound; object URLs lived until `markPreviewReady()`/manual delete.
- After: max 32 object URLs and max 10-minute lifetime even if preview events never arrive.

### 2. RTK Query message cache could grow without a per-conversation cap

Files:

- `src/features/api/chatApi.ts`
- `src/features/chat/domain/messageMerge.ts`

Confirmed by code: `getMessages` serializes all queries by `conversationId` and merges older/newer pages into the same cache entry. The merge path did not bound `cache.messages`.

Fix:

- `buildConversationMessagesCache()` trims each conversation cache to 600 messages.
- Pending/optimistic/queued/retrying/failed local messages are preserved even if old.
- Cache indices (`messageById`, `messageIds`, loaded window seq/id metadata) are rebuilt from the bounded list.

Before/after:

- Before: per-conversation RTKQ message arrays were unbounded while pages/realtime events merged.
- After: per-conversation RTKQ message arrays are capped at 600 plus protected pending local semantics.

### 3. Legacy Zustand chat message cache retained inactive conversations

File: `src/stores/chatStore.ts`

Confirmed by code: legacy `chatStore.messages` stores message arrays keyed by conversation. Switching conversations did not trim old inactive conversation histories.

Fix:

- On `selectConversation`, inactive conversation message arrays are trimmed to 120 messages.
- Pending/optimistic/queued/retrying/failed/uploading local messages are preserved.
- `messageById`, `messageIdsByConversation`, alias index, and message window metadata are rebuilt consistently from retained messages.

Before/after:

- Before: inactive conversations could retain large message arrays for the lifetime of the SPA session.
- After: switching conversations prunes inactive windows to bounded recent history while preserving retry/reconcile rows.

### 4. Logout reset did not clear RTK Query chat cache or blob preview cache

Files:

- `src/store/index.ts`
- `src/stores/storeResetRegistry.ts`

Confirmed by code: auth logout uses `runRegisteredStoreResets()`. Zustand stores registered resetters, but Redux/RTK Query cache was not registered there.

Fix:

- Registered `redux-chat-api` resetter.
- On logout/reset: dispatches `chatApi.util.resetApiState()` and clears `blobPreviewCache`.

Before/after:

- Before: RTKQ cache could survive local logout in the same tab.
- After: auth cleanup clears RTKQ chat server-state cache and Blob preview URLs.

### 5. WebSocket listener registration needed observable listener counts

Files:

- `src/lib/socket.ts`
- `src/hooks/useWebSocket.ts`
- `src/features/chat/realtime/registerChatEvents.ts`

Confirmed by code:

- `registerChatEvents()` returns cleanup.
- `useWebSocket.setupSocket()` calls existing unsubscribers before registering new listeners.
- Window/document listeners inspected have cleanup functions.

Fix:

- Added `WebSocketManager.getListenerCount()`.
- Added dev debug logs after listener cleanup and setup so reconnect cycles can prove listener counts do not grow.
- Added cleanup regression test for `registerChatEvents`.

## Rendering Audit

Confirmed by code:

- `MessageList` path uses the existing virtualized timeline family (`src/features/chat/simple-virtual-timeline`).
- Stable message identity helpers exist and tests cover optimistic/server reconciliation.

No new virtualization dependency was added.

## Media / Upload / Audio / Location Audit

Confirmed fixed:

- Image/file upload draft previews already revoke draft `previewUrl` on remove, clear, acknowledge sent, and unmount in `useUploadQueue`.
- The extra post-send blob preview cache is now bounded and revoked.

CHUA XAC MINH runtime:

- Audio recorder stream/AudioContext behavior was not browser-tested in this unauthenticated run.
- Location/map preview cleanup was not exercised with real messages.

## Dev Logs / Debug Buffers

Confirmed by code:

- `src/utils/logger.ts` redacts sensitive/large keys and truncates strings/arrays.
- `socket.ts` logs raw message metadata for message-created aliases, not full raw payload, through `logMessageDebug`.
- Preload desktop toast dedupe cache is bounded to 200 message IDs.

## Desktop Check

Repo: `chat-window-desktop`

Confirmed by code:

- Single `BrowserWindow` creation path.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Shell loads web URL; it does not own chat message/cache truth.
- Preload IPC helper returns unsubscribe for registered updater listeners.
- Desktop toast dedupe set is bounded to 200 IDs.

No desktop code changed. The high-risk retained memory was in web message/media cache, so the root fix belongs in `chat-web-client`.

## Tests / Verification

Passed:

- `npm ci`
- `npm run typecheck`
- `npm test -- --exclude "**/*.bench.test.*" src/features/chat/domain/messageMerge.test.ts src/features/chat/realtime/registerChatEvents.test.ts src/lib/blobPreviewCache.test.ts`
- `npm run build`

Failed / baseline:

- `npm run lint` failed with 92 errors and 24 warnings across unrelated baseline files, mostly React Compiler rules and existing restricted-import/no-unused issues. Examples include `QrLoginPanel.tsx`, `SafeImage.tsx`, `FriendQrWorkspace.tsx`, `GroupInfo.tsx`, `LoginPage.tsx`, and `types/pdfmake.d.ts`.
- `npm test` full suite failed with 54 files passing, 1 skipped, 3 failing:
  - `src/features/audio/__tests__/phase2c-audio.test.ts`: bad relative import `../features/audio/useAudioRecorder`.
  - `src/hooks/useSendMessage.test.tsx`: expected finalized attachment payload not to include `url`, received signed URL.
  - `src/services/tokenService.test.ts`: expected non-remembered refresh token in `sessionStorage`, received `null`.

Build warnings:

- Existing Rollup circular re-export warnings around `EmptyState.tsx` via `components/ui/index.ts`.
- Existing large chunk warnings.

## Regression Risk

- Trimming message caches means inactive conversation history beyond the retained window must be reloaded from the API when needed. This is intended and keeps backend/API as source of truth.
- Active conversation RTKQ cache is capped at 600 messages. Very deep scroll sessions will rely on pagination to reload older windows instead of keeping all history in memory.
- Blob preview fallback now expires after 10 minutes. If thumbnail generation takes longer and the server still has no preview/original URL, the local optimistic image fallback can disappear; this is safer than pinning large Blob memory indefinitely.

## Follow-Up

- Run authenticated browser/e2e memory test with seeded conversations and media to collect the missing Phase 1 before/after runtime numbers.
- Consider adding a small dev-only memory panel/counter gated by an env flag for `performance.memory`, `blobPreviewCache.size()`, RTKQ message counts, and websocket listener count.
