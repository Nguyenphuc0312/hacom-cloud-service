# PERFORMANCE_SMOOTHNESS_AUDIT

## 1. Executive Summary

- Muc do hien tai: message timeline va sidebar da co virtualization; RTK Query message cache da bounded 600 messages/conversation; blob preview cache bounded 32 entries; mock runtime khong thay listener/DOM tang tuyen tinh.
- Rui ro lon nhat: startup/chat route bundle van nang (`index` ~915.66 kB, `ChatPage` ~426.41 kB, `editor-vendor` ~359.06 kB, `xlsx` ~429.19 kB, `pdf` ~334.78 kB); `apiContract.ts` bi mixed dynamic/static import nen dynamic import khong tach chunk.
- Fix da lam: go bo circular chunk warning quanh `EmptyState` bang direct imports tai cac import site ma Rollup canh bao.
- Fix nen lam phase sau: do click/input/realtime latency bang Playwright trace rieng; tach cac module nang khoi first chat route; tiep tuc coalesce high-frequency realtime/presence neu trace that cho thay input jank.

## 2. Baseline Environment

- Date: 2026-07-03
- Build command: `npm install`, `npm run build`
- Browser: Playwright Chromium, production Vite preview `http://127.0.0.1:4173`, flags `--enable-precise-memory-info`, `--js-flags=--expose-gc`
- Dataset/mock: local mocked auth, 25 conversations, `conv-large` with 1,500 seed messages plus 1 optimistic send, fake raw WebSocket transport
- Measurement method: `scripts/memory-runtime-verification.mjs` with `MEMORY_VERIFY_IDLE_MS=1000`, forced GC snapshots via `window.__chatMemoryProbe`, build output comparison

Raw outputs:

- Before: `smoothness-baseline-before.json`
- After: `smoothness-baseline-after.json`

## 3. Smoothness KPIs

| Scenario | Before | After | Target | Status |
|---|---:|---:|---:|---|
| Initial large conversation visible DOM nodes | 1,227 nodes / 18 mounted message rows | 1,448 nodes / 24 mounted message rows | Bounded, not 1,500 rows | PASS |
| Load older pages from 1,500-message fixture | 600 RTKQ messages / 1,447 DOM nodes | 600 RTKQ messages / 1,447 DOM nodes | Cache bounded, DOM stable | PASS |
| Switch 20 conversations | 50 RTKQ messages / 1,447 DOM nodes / 68 WS listeners | 50 RTKQ messages / 1,447 DOM nodes / 68 WS listeners | No linear DOM/listener growth | PASS |
| WebSocket reconnect 5x | 68 -> 68 WS listeners | 68 -> 68 WS listeners | No listener leak | PASS |
| Visibility/focus cycles 10x | 68 WS listeners, DOM 1,447 | 68 WS listeners, DOM 1,447 | No listener/DOM growth | PASS |
| Seed 40 blob previews | retained 32 entries | retained 32 entries | Bounded preview cache | PASS |
| Optimistic text send | RTKQ 50 -> 51, mounted rows 24 -> 25 | RTKQ 50 -> 51, mounted rows 24 -> 25 | One optimistic/server row, no duplicate | PASS |
| Logout/login after media cache | blob cache 32 -> 0 | blob cache 32 -> 0 | Cleanup transient media state | PASS |
| Circular `EmptyState` Rollup warnings | 5 warnings | 0 warnings | No circular chunk warning | PASS |
| Click-to-first-message-visible latency | CHUA XAC MINH | CHUA XAC MINH | <100 ms cached, <300 ms uncached | GAP |
| WS-event-to-bubble-visible latency | CHUA XAC MINH | CHUA XAC MINH | <50 ms local fake event | GAP |
| Composer input latency under WS burst | CHUA XAC MINH | CHUA XAC MINH | No visible lag / no long task >50 ms | GAP |

## 4. Findings

| ID | Area | Severity | Symptom | Root Cause | Evidence | Files |
|---|---|---|---|---|---|---|
| F01 | Bundle/startup | P1 | Rollup warned about circular dependency between chunks | `EmptyState` exports were imported through `components/ui` barrel from modules that also participate in chunk split | Before build printed 5 `Export "...EmptyState..." was reexported... circular dependency between chunks` warnings; after build has none | `src/components/layout/sidebar/RoomListEmptyStates.tsx`, `src/pages/ChatPage.tsx`, `src/pages/NotificationsPage.tsx`, `src/components/modals/NewChatModal.tsx` |
| F02 | Message list | P0 already handled | Risk of rendering thousands of messages | Timeline uses `@tanstack/react-virtual`; RTKQ cache trims to 600 | Runtime after deep pagination: 600 RTKQ messages, 1,447 DOM nodes, 24 mounted message rows | `src/features/chat/simple-virtual-timeline/SimpleVirtualizedChatTimeline.tsx`, `src/features/chat/domain/messageMerge.ts` |
| F03 | Sidebar | P0 already handled | Risk of full sidebar DOM under many conversations | Sidebar uses `react-window` above threshold 10 | Runtime mounted conversation rows stayed 23 for 25-conversation fixture | `src/components/layout/sidebar/RoomList.tsx` |
| F04 | Realtime metadata bursts | P0 already handled | Delivered/read/reaction bursts can cause repeated cache patches | Metadata events are coalesced once per animation frame | Focused test `realtimeBatchCoordinator.test.ts` passed; code routes read/delivered/reaction through coordinator | `src/features/realtime/realtimeMiddleware.ts`, `src/features/realtime/realtimeBatchCoordinator.ts` |
| F05 | Media/blob previews | P0 already handled | Object URLs can pin memory after preview close/switch | Module cache uses TTL, max 32 entries, revoke on delete/clear | Runtime: seed 40 -> retained 32; logout clears 32 -> 0; `blobPreviewCache.test.ts` passed | `src/lib/blobPreviewCache.ts`, `src/hooks/useUploadQueue.ts`, `src/components/message/ImageMessage.tsx` |
| F06 | Bundle/chunks | P2 | First load/route transition may still be heavier than Messenger/Zalo feel | Large always-loaded or mixed-loaded chunks remain | After build: `index` 915.66 kB, `ChatPage` 426.41 kB, `editor-vendor` 359.06 kB, `xlsx` 429.19 kB; mixed dynamic/static warning for `apiContract.ts` | `vite.config.ts`, route/component imports |
| F07 | Browser latency trace | P1 gap | Required latency KPIs are not fully covered by current probe | Current script measures cache/listener/DOM/heap, not frame drops/input latency | `smoothness-baseline-*.json` has no click/input/event-to-render duration fields | `scripts/memory-runtime-verification.mjs`, future `scripts/perf/*` |

## 5. Fixes Implemented

| Fix | Files changed | Why it helps | Risk | How verified |
|---|---|---|---|---|
| Direct import `EmptyState` family instead of `components/ui` barrel at warned sites | `src/components/layout/sidebar/RoomListEmptyStates.tsx`, `src/pages/ChatPage.tsx`, `src/pages/NotificationsPage.tsx`, `src/components/modals/NewChatModal.tsx` | Removes Rollup circular chunk warning and reduces startup/route-transition execution-order risk | Low; import-only change, no runtime behavior change intended | `npm run typecheck`, targeted Vitest, `npm run build`; after build no `EmptyState` circular warnings |

## 6. Remaining Bottlenecks

| Priority | Bottleneck | Suggested phase | Expected impact |
|---|---|---|---|
| P1 | Add dedicated smoothness Playwright trace: conversation click latency, fake WS burst, input typing during burst, long tasks, dropped frames | Phase next | Converts remaining `CHUA XAC MINH` latency gaps into repeatable gates |
| P1 | `apiContract.ts` mixed dynamic/static import prevents route chunk split | Bundle phase | Lower route transition/startup work if heavy consumers stop pinning it into initial chunks |
| P1 | `ChatPage` 426.41 kB and `editor-vendor` 359.06 kB | Composer/media lazy phase | Faster first chat route and less JS parse/compile before first usable chat |
| P2 | `xlsx`, `pdf`, `docx-preview`, AI assistant chunks are large | Attachment preview/export phase | Keep document tooling off the chat hot path until user opens preview/export |
| P2 | Composer input latency under realtime burst not currently gated | Realtime/composer phase | Prevent regressions where message stream steals main-thread time from typing |

## 7. Test / Verification Commands

```bash
npm install
npm run build
npm run typecheck
node ./node_modules/vitest/vitest.mjs run src/features/chat/simple-virtual-timeline/estimateAttachmentHeight.test.ts src/lib/blobPreviewCache.test.ts src/features/realtime/realtimeBatchCoordinator.test.ts

# before/after runtime probe
MEMORY_VERIFY_IDLE_MS=1000 MEMORY_VERIFY_OUTPUT=smoothness-baseline-before.json node scripts/memory-runtime-verification.mjs
MEMORY_VERIFY_IDLE_MS=1000 MEMORY_VERIFY_OUTPUT=smoothness-baseline-after.json node scripts/memory-runtime-verification.mjs
```

Windows PowerShell form used:

```powershell
$env:MEMORY_VERIFY_IDLE_MS='1000'
$env:MEMORY_VERIFY_OUTPUT='smoothness-baseline-after.json'
node scripts\memory-runtime-verification.mjs
```

## 8. Rollback Notes

- Import fix rollback: revert the four direct `EmptyState` imports to the previous `components/ui` barrel imports. Expected regression: Rollup circular chunk warnings return.
- No API, WebSocket, state contract, cache semantics, UI behavior, or migration changed.
- Runtime probe artifacts `smoothness-baseline-before.json` and `smoothness-baseline-after.json` are measurement artifacts only; deleting them does not affect runtime.
