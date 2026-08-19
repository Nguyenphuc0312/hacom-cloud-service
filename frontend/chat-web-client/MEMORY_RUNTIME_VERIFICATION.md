# MEMORY_RUNTIME_VERIFICATION

## Scope

Phase 2 runtime verification for `chat-web-client`, based on the fixes recorded in `MEMORY_AUDIT.md`.

This verification used a production build served by `vite preview`, Chromium Playwright, local mocked authenticated API data, and a fake raw WebSocket transport. No production credentials or production data were used.

## Environment

- Date: 2026-07-03
- Repo: `D:\Workspace\hacom_holding_dx\projects\chat-web-client`
- Runtime: Vite production preview
- Browser: Playwright Chromium
- Chromium flags:
  - `--enable-precise-memory-info`
  - `--js-flags=--expose-gc`
- Measurement source:
  - `performance.memory.usedJSHeapSize`
  - forced `globalThis.gc()` before every probe snapshot
  - DOM node count via `document.getElementsByTagName("*").length`
  - RTK Query message cache count via store state
  - legacy Zustand message count via `useChatStore`
  - `blobPreviewCache.size()`
  - `WebSocketManager.getListenerCount()`

## Repeatable Command

Build first:

```powershell
npm run build
```

Run full verification:

```powershell
node scripts/memory-runtime-verification.mjs
```

Useful overrides:

```powershell
$env:MEMORY_VERIFY_PORT='4175'
$env:MEMORY_VERIFY_IDLE_MS='300000'
$env:MEMORY_VERIFY_COMPOSER_TIMEOUT_MS='12000'
node scripts/memory-runtime-verification.mjs
```

Raw result was written to:

```text
memory-runtime-verification-results.json
```

## Test Data

Generated locally inside the Playwright route mock:

| Data | Count |
| --- | ---: |
| Users | 2 |
| Conversations | 25 |
| Large conversation seed messages | 1,500 |
| Message mix | text plus image/file attachment metadata |
| Optimistic send payloads | 1 |

Note: the raw result reports `largeConversationMessages: 1501` because the optimistic send scenario appends one server-acknowledged message after seeding 1,500.

## Runtime Memory Table

Full run: `2026-07-03T08:53:42.620Z`, base URL `http://127.0.0.1:4175`, idle wait `300000ms`.

| Scenario | Heap before | Heap after | Delta | DOM nodes after | RTKQ msgs after | Zustand msgs after | Blob cache | WS listeners |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| login open large initial | n/a | 13,904,062 | n/a | 1,227 | 50 | 0 | 0 | 68 |
| idle 5 minutes | 13,911,372 | 14,333,654 | +422,282 | 1,447 | 50 | 0 | 0 | 68 |
| load 1,500 pages + deep scroll | 14,336,438 | 16,379,069 | +2,042,631 | 1,447 | 600 | 0 | 0 | 68 |
| switch 20 conversations | 16,341,865 | 34,146,683 | +17,804,818 | 1,447 | 50 | 0 | 0 | 68 |
| WebSocket reconnect 5x | 22,048,301 | 22,433,799 | +385,498 | 1,447 | 50 | 0 | 0 | 68 |
| visibility/focus cycle 10x | 16,639,558 | 16,758,796 | +119,238 | 1,447 | 50 | 0 | 0 | 68 |
| seed 40 blob previews | 16,733,864 | 16,851,222 | +117,358 | 1,447 | 50 | 0 | 32 | 68 |
| optimistic send + reconcile | 16,851,642 | 18,127,518 | +1,275,876 | 1,475 | 51 | 0 | 32 | 68 |
| logout + login again | 18,103,834 | 17,379,940 | -723,894 | 1,475 | 50 | 0 | 0 | 68 |

## Confirmed

- RTK Query message cap is effective at runtime: loading older pages from a 1,500-message conversation stopped at 600 cached messages.
- Legacy Zustand message cache did not receive duplicated message history in this runtime path: `legacyTotalMessages` stayed 0.
- `blobPreviewCache` is bounded: seeding 40 object URLs left 32 entries.
- Logout clears blob previews: blob cache moved from 32 to 0 after `logoutSoft()` and re-entering the app.
- WebSocket listener count stayed flat at 68 across:
  - initial open
  - 5 reconnect cycles
  - 10 visibility/focus cycles
  - logout/login
- DOM node count stayed stable at 1,447 during deep pagination, conversation switching, reconnect, visibility cycles, and media cache seeding. Optimistic send added one rendered message row, ending at 1,475 nodes.
- Optimistic send did not duplicate in cache during the measured path: RTKQ messages moved from 50 to 51 after send/ack.

## Regression Checks

| Check | Result |
| --- | --- |
| Large conversation can load older pages after cache trimming | PASS, RTKQ reached cap 600 from a 1,500-message fixture |
| Deep scroll does not grow DOM nodes linearly | PASS, DOM stayed 1,447 after loading pages |
| Switch 20 conversations does not keep all inactive message pages | PASS, final RTKQ count returned to 50 for active conversation |
| WebSocket reconnect does not multiply listeners | PASS, listener count stayed 68 |
| Visibility/focus cycles do not multiply listeners | PASS, listener count stayed 68 |
| Blob preview cache cap | PASS, 40 seeded previews retained 32 |
| Logout clears chat API/blob transient state | PASS for blob cache; RTKQ active route reloaded 50 messages after re-login |
| Optimistic message reconcile | PASS for single text send; cache increased by one message only |
| UI file picker/upload preview | CHUA XAC MINH in browser UI; runtime verified the shared object URL cache directly |
| Real backend WebSocket reconnect | CHUA XAC MINH; test used raw WebSocket shim with the same client socket manager |

## Console Events

No runtime `pageerror` was recorded.

Warnings recorded: repeated TipTap warning:

```text
[tiptap warn]: Duplicate extension names found: ['link']. This can lead to issues.
```

This warning appears when opening/switching chat composers and is not introduced by the memory probe. It is a separate cleanup candidate because repeated editor mount warnings can make performance signal noisy.

## Code Added For Verification

- `src/utils/memoryRuntimeProbe.ts`
  - Installs `window.__chatMemoryProbe` only when `?memoryProbe=1` or `localStorage["chat-memory-probe"] === "1"`.
  - Exposes heap/cache/listener/DOM snapshots.
  - Exposes test-only helpers for loading older RTKQ pages, reconnecting socket, seeding blob previews, and invoking production `logoutSoft()`.
- `src/main.tsx`
  - Calls `installMemoryRuntimeProbe()` during bootstrap. The probe is inert unless explicitly enabled.
- `scripts/memory-runtime-verification.mjs`
  - Repeatable Playwright runtime measurement script.
  - Starts `vite preview`, seeds auth, mocks `/api/v1/**`, fakes raw WebSocket, runs the required scenarios, and writes JSON output.
- `memory-runtime-verification-results.json`
  - Raw full-run evidence from the 5-minute idle verification.

## Verification Commands

Passed:

```powershell
npm run typecheck
npm run build
npx eslint src/main.tsx src/utils/memoryRuntimeProbe.ts scripts/memory-runtime-verification.mjs
node .\node_modules\vitest\vitest.mjs run src\features\chat\realtime\registerChatEvents.test.ts src\lib\blobPreviewCache.test.ts src\hooks\useWebSocket.sync-machine.test.ts
node scripts\memory-runtime-verification.mjs
```

Targeted suite with known unrelated failure:

```powershell
npm run test:chat-runtime
```

Result: 117 passed, 1 failed. Failure:

```text
src/hooks/useSendMessage.test.tsx
maps finalized attachments without legacy object storage fields
expected attachment not to have property "url"
```

This is the same attachment payload baseline failure already observed during `MEMORY_AUDIT.md` verification and is unrelated to the runtime probe/script changes.

Build warnings observed:

- Existing Rollup circular chunk warnings around `EmptyState.tsx` re-exports.
- Existing dynamic/static import chunk warnings.
- Existing large chunk warning.

## Desktop Comparison

`chat-window-desktop` exists and is a thin Electron shell loading `appUrl`. Code trace found:

- `src/main.js` uses `BrowserWindow`.
- `src/preload.js` uses `ipcRenderer` and removes listeners for the generic subscription helper.
- Desktop package has `npm start`, `npm run dev`, and Electron build scripts.

CHUA XAC MINH runtime desktop memory: not measured in this run because launching Electron GUI requires an interactive desktop process. Web root-cause verification is complete; no desktop-specific code was changed.

## Remaining Risk

- The Playwright run uses mocked REST/WebSocket data, so it confirms frontend memory behavior and cache/listener bounds, not backend latency or real production fanout behavior.
- UI upload/file-picker preview was not driven end-to-end; shared object URL cache behavior was verified directly.
- Conversation switching produced a temporary heap rise, but later forced-GC snapshots after reconnect/visibility dropped back near the 16-22 MB range while listener/cache counts stayed bounded. This does not look like a linear leak, but a longer soak with real backend data is still recommended.
- TipTap duplicate `link` extension warnings are noisy and should be cleaned separately.
