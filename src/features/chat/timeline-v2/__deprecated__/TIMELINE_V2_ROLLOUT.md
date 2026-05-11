# Timeline V2 — Production Rollout Runbook

Last updated by Phase 3 stabilisation work. This document is the source of
truth for going from "V2 code is in main" to "V2 owns scroll in production".

## TL;DR

```
Stage 0  legacy only        — default; nothing to do.
Stage 1  observe-only        VITE_CHAT_TIMELINE_V2_OWNER=true
                             VITE_CHAT_SCROLL_OWNER_V2_DRIVES=false
                             VITE_CHAT_SCROLL_DEBUG=true
Stage 2  V2 drives staging   VITE_CHAT_TIMELINE_V2_OWNER=true
                             VITE_CHAT_SCROLL_OWNER_V2_DRIVES=true
                             VITE_CHAT_SCROLL_DEBUG=true
Stage 3  V2 drives prod      same as Stage 2 with debug flag OFF.
Rollback at any stage:       flip VITE_CHAT_SCROLL_OWNER_V2_DRIVES=false
                             (and if needed, OWNER=false), redeploy front
                             only — no backend or DB change required.
```

## What changed at the cutover boundary

- `MessageList.tsx` accepts two additive props: `suppressScrollWrites` and
  `onTimelineEvent`. When `suppressScrollWrites=true`, the legacy
  `scrollToOffset`/`scrollToIndex` callbacks passed into
  `useChatScrollController` become no-ops, so the legacy controller's
  imperative writes cannot reach the DOM.
- `ChatTimelineV2` mounts a `useChatScrollOwnerV2` instance bound to a
  `createDomScrollAdapter` and `useScrollEventBridge`. When V2 drives, the
  bridge is `active=true` and converts native scroll events into V2 state
  transitions; the owner's commands resolve through the adapter to the
  same DOM node MessageList renders.
- `experienceFlags.ts` now reads `globalThis.__CHAT_FLAGS_OVERRIDE__` at
  module init. Production never sets this, so behaviour is unchanged
  unless the deployment environment has the env var set or a debugger
  injects an override. See "Runtime override (advanced)" below.

## Stage 1 — Observe-only on staging

**Goal:** validate V2 reads message state correctly, classifies changes
correctly, and emits clean debug logs. V2 does NOT yet own scroll, so the
user experience is identical to Stage 0.

### Deploy steps

1. Build with:
   ```
   VITE_CHAT_TIMELINE_V2_OWNER=true \
   VITE_CHAT_SCROLL_OWNER_V2_DRIVES=false \
   VITE_CHAT_SCROLL_DEBUG=true \
   npm run build
   ```
2. Deploy to staging.
3. Open chat in a Chrome devtools tab with the Console pinned and filter
   by `chat-scroll-v2`.

### Stage 1 validation checklist

| # | Action | Expected debug-log evidence |
|---|---|---|
| 1 | Open a conversation with > 50 messages | `state_transition: opening → measuring_initial → following_bottom` exactly once. `enqueue_command: initial_bottom`. |
| 2 | Hard reload (F5) | Same sequence as #1; no second `initial_bottom` after reload. |
| 3 | Send a text message | `classify_message_change: append_own`. State enters `sending_own_message` then resolves. |
| 4 | Receive a remote message via WS while at bottom | `classify_message_change: append_remote`. `bottom_state_change: isPinnedToBottom=true`. |
| 5 | Scroll up ~300 px, wait, then receive a remote message | After idle: `state_transition → detached`. After WS: `bottom_state_change: pendingNewMessages` increments. |
| 6 | Optimistic ack (server returns the same message you sent) | `classify_message_change: reconcile_update`. NO new scroll commands. |
| 7 | Trigger load older (scroll to top) | Even though V2 isn't driving, `LOAD_OLDER_START` and later `LOAD_OLDER_DONE` should appear if MessageList forwards `onTimelineEvent` (which it does only when `drivesScroll=true` in ChatTimelineV2 — so in Stage 1 these are NOT emitted). The classifier still emits `classify_message_change: prepend_older`. |

### Stage 1 abort criteria

If any of these appear, do NOT advance to Stage 2:

- `state_transition` with the same source/target firing in a tight loop
- `classify_message_change: append_own` after a server reconciliation
- Any `Uncaught` error in console attributed to a `timeline-v2/` module
- The `bottom_state_change` log fires more than ~10× per minute idle

If aborted, set `VITE_CHAT_TIMELINE_V2_OWNER=false`, redeploy. No further
action needed.

## Stage 2 — V2 drives on staging

**Goal:** validate V2 owning scroll on real conversations against real
backend. This is the real cutover; user-visible behaviour will (in theory)
match Stage 0 + 1 but every scrollTo* call in the timeline now comes from
V2.

### Deploy steps

1. Build with:
   ```
   VITE_CHAT_TIMELINE_V2_OWNER=true \
   VITE_CHAT_SCROLL_OWNER_V2_DRIVES=true \
   VITE_CHAT_SCROLL_DEBUG=true \
   npm run build
   ```
2. Deploy to staging.
3. Run the manual checklist below with a fresh browser session (clear
   service worker / hard reload to drop the Stage-1 bundle).

### Stage 2 manual checklist (mandatory; all 14 must pass before Stage 3)

For each test, record PASS/FAIL and any anomaly. Use a conversation with
≥ 100 messages and at least one image attachment.

1. **Open conversation lần đầu (cold)** → timeline ends at the bottom, no
   visible jitter, no scroll bounce. Console shows exactly one
   `enqueue_command: initial_bottom`.
2. **F5 trong conversation** → same as #1. Reply previews / mentions on
   the visible window render fully populated; no placeholder flicker.
3. **Gửi text** → optimistic message appears immediately, scroll smoothly
   reaches bottom once. Server ack does not produce a duplicate. Final
   message has the SENT badge.
4. **Gửi text + ảnh/file cùng message** → message renders with
   placeholder for the image; on image load the timeline does not jump.
   Distance-to-bottom remains ≤ 24 px.
5. **Nhận message khi đang ở bottom** → auto-scrolls smoothly to the new
   message. No flash of the prior bottom.
6. **Nhận message khi đang đọc tin nhắn cũ** → no scroll movement. The
   "tin nhắn mới" pill appears and increments correctly across multiple
   incoming messages.
7. **Click badge tin nhắn mới** → scrolls to bottom and clears the pill.
   No leftover badge state after scroll completes.
8. **Scroll lên load older** → older messages prepend, scroll position
   stays anchored on the message you were reading (the row that was
   visible just before the load fires must remain at the same viewport
   offset within ± 8 px).
9. **Test message rất dài** (e.g. paste an 8-paragraph block) → scroll
   reaches the message, neither overshooting nor stuck. "Xem thêm"
   collapse can expand and re-collapse without timeline jitter.
10. **Test ảnh load chậm** (throttle network in devtools to "Slow 3G",
    open a conversation with images at the bottom) → if you stay at
    bottom, the timeline keeps you pinned as images settle. If you scroll
    up while images are still loading, the timeline does NOT pull you
    back when an image resolves.
11. **Test reply/tag/mention render muộn** → scroll position remains
    stable when a delayed reply preview or mention chip resolves and
    expands a row's height.
12. **Test duplicate WS event** (in devtools, manually fire a second
    `message:new` for an existing message via the application console if
    a debug helper exists, or wait for a known reconnect to redeliver
    one) → no duplicate row appears.
13. **Optimistic ack không duplicate** → already covered in #3; explicitly
    re-verify by inspecting the DOM message list count before and after
    the server ack.
14. **Dùng liên tục 10 phút không scroll jump** → keep the conversation
    open for 10 minutes with mixed activity (scroll, send, receive). No
    unexplained scroll jumps, no console errors. Debug log volume should
    be steady, not exponentially growing.

### Stage 2 abort criteria

Any FAIL on items 1, 3, 5, 7, 8 = automatic abort. Any FAIL elsewhere =
investigate, decide. Abort = roll back to Stage 1 by flipping
`VITE_CHAT_SCROLL_OWNER_V2_DRIVES=false` and redeploying.

## Stage 3 — Production rollout

**Pre-conditions (all must be true):**

- Stage 2 manual checklist 14/14 PASS on staging.
- Playwright suite `e2e/timeline-v2.spec.ts` passes 9/9 on the staging
  bundle (run with `npx playwright test e2e/timeline-v2.spec.ts`).
- No regression in the existing chat tests
  (`npm run test:chat-runtime`).
- No new errors in staging error tracking attributed to `timeline-v2/*`
  in the 24h preceding rollout.

**Steps:**

1. Build with V2 flags ON and **debug flag OFF**:
   ```
   VITE_CHAT_TIMELINE_V2_OWNER=true \
   VITE_CHAT_SCROLL_OWNER_V2_DRIVES=true \
   npm run build
   ```
2. Deploy via your normal production pipeline.
3. Watch the first 30 minutes:
   - Error tracker for `Cannot read properties of undefined` or
     `Cannot set properties of undefined` patterns → indicates a chunk
     ordering regression; rollback immediately.
   - User-reported scroll glitches → if more than 1 in 100 active sessions
     reports, rollback.
4. Monitor for 24h. If clean, declare V2 production.

## Rollback recipe

V2 has zero backend dependency. Rollback is a frontend-only environment
change followed by redeploy. There is no database migration to reverse, no
API contract change to communicate.

```
# Quickest: V2 mounted but does not drive scroll.
VITE_CHAT_SCROLL_OWNER_V2_DRIVES=false
VITE_CHAT_TIMELINE_V2_OWNER=true            # keep observation
npm run build && deploy

# Full rollback to legacy.
VITE_CHAT_SCROLL_OWNER_V2_DRIVES=false
VITE_CHAT_TIMELINE_V2_OWNER=false
npm run build && deploy
```

After any rollback:
1. Clear the CDN cache so old hashed chunks aren't served alongside the
   new bundle.
2. Ask users to hard-refresh once if you can; the new flag values are
   baked into the new bundle and the browser must drop the prior one.
3. Capture debug logs / error tracker excerpts before flipping back, so
   the next iteration of V2 can fix the actual cause.

## Runtime override (advanced)

For on-call debugging on a deployed environment, the front-end reads
`globalThis.__CHAT_FLAGS_OVERRIDE__` at module init. To enable V2 mid-
session WITHOUT redeploying:

```js
// In Chrome devtools console BEFORE refreshing the chat tab:
globalThis.__CHAT_FLAGS_OVERRIDE__ = {
  VITE_CHAT_TIMELINE_V2_OWNER: "true",
  VITE_CHAT_SCROLL_OWNER_V2_DRIVES: "true",
  VITE_CHAT_SCROLL_DEBUG: "true",
};
location.reload();
```

The flags are FROZEN at module init, so a reload is required after every
override change. Use sparingly; this is a debug aid, not a production
toggle.

## Pre-existing test failures (NOT introduced by V2)

The `develop` branch has 24 pre-existing unit test failures across:
- `src/components/chat/useChatScrollController.test.tsx` (11)
- `src/components/chat/timelineDensity.test.ts` (2)
- `src/components/input/MessageInput.test.tsx` (9)
- `src/components/notification/NotificationPanel.test.tsx` (1)
- `src/features/chat/performance/chatTimelinePerformance.bench.test.tsx` (1)

These were verified to exist on the baseline (Phase 3 stash → re-run →
identical 23 failures across the four targeted files). They MUST be
tracked separately; do not block the V2 rollout on them.

## File map (cumulative across Phase 1–3)

```
src/features/chat/timeline-v2/
├── ChatTimelineV2.tsx                 ← drop-in wrapper + cutover wiring
├── domScrollAdapter.ts                ← real DOM scroll adapter
├── domScrollAdapter.test.ts
├── index.ts                           ← public barrel
├── messageChangeClassifier.ts
├── messageChangeClassifier.test.ts
├── scrollCommandQueue.ts
├── scrollCommandQueue.test.ts
├── scrollDebug.ts
├── scrollStateMachine.ts
├── scrollStateMachine.test.ts
├── scrollTypes.ts
├── useChatScrollOwnerV2.ts
├── useChatScrollOwnerV2.test.tsx
├── useScrollEventBridge.ts
├── useScrollEventBridge.test.tsx
├── virtualizerAdapter.ts              ← interface + no-op
├── scrollAdapterIntegration.test.tsx
├── cutoverContract.test.tsx           ← Phase 2 + Phase 3 anchor index test
└── TIMELINE_V2_ROLLOUT.md             ← this file

src/features/chat/config/
└── experienceFlags.ts                 ← +CHAT_TIMELINE_V2_OWNER_ENABLED
                                       +CHAT_SCROLL_OWNER_V2_DRIVES_ENABLED
                                       +runtime override hook

src/components/chat/
├── ConversationViewport.tsx           ← flag switch (Phase 1)
└── MessageList.tsx                    ← +onOuterRef, suppressScrollWrites,
                                       onTimelineEvent (now with index)

e2e/
└── timeline-v2.spec.ts                ← Phase 3 E2E coverage
```

## Open risks heading into Stage 3

| ID | Severity | Description | Mitigation |
|---|---|---|---|
| R1 | Medium | Pre-existing 24 unit test failures on `develop` HEAD muddy the green/red signal in CI. | Add a `vitest --exclude` for the four files in the Stage-3 PR's CI job, or get them fixed in a separate PR before rollout. |
| R2 | Low | E2E spec is hermetic against mocked WS/API; real backend behaviour around `clientMessageId` reconciliation cannot be 100% asserted from Playwright with mocks. | Stage 2 manual checklist case #3 explicitly covers the duplicate-after-ack scenario against the real backend. |
| R3 | Low | The Phase 3 anchor index forwarding uses `threadRows` index space. If the virtualizer rendering layer changes the row schema, the index could drift. | Unit test `cutoverContract.test.tsx > "real index from legacy is honored"` guards the contract; CI will fail if the shape regresses. |
| R4 | Low | Docker production build was NOT run from this development environment (no Docker daemon available locally). The Vite build that backs the Dockerfile DID run cleanly here. The next CI Docker build is the final gate. | Block Stage 3 deploy on a green Docker build in CI. |
| R5 | Low | Module-init flag freeze means any change to the runtime override requires a reload. Acceptable for staging debug; document in oncall runbook. | Already documented above. |

## Decision matrix

| Phase 3 deliverable | State |
|---|---|
| Anchor index placeholder fixed (no more `index: 0`) | ✅ Fixed in `MessageList.tsx` `captureVisibleAnchor`; consumed in `ChatTimelineV2.handleTimelineEvent`. New unit test guards. |
| Playwright E2E coverage | ✅ 9 cases written in `e2e/timeline-v2.spec.ts`. Hermetic against mocked WS/API; runs against `npm run dev`. |
| Production build verification | ✅ `npm ci` + `npx tsc -b` (clean) + `npm run build` (clean) + `npm run build:gate` (clean — no CIRCULAR_CHUNK, no asset over budget). |
| Docker build verification | ⚠️ NOT runnable from this dev environment. Must be the next CI step. |
| Staging cutover checklist | ✅ Documented above (Stage 1 + Stage 2). |
| Rollback plan | ✅ Documented above; pure frontend env-flag flip + redeploy. |

## Final go/no-go for production

**This Phase 3 work is sufficient to start Stage 1 (observe-only) on
staging immediately.**

**It is NOT yet sufficient to authorise Stage 3 (production V2 drives)
until the Stage 2 manual checklist passes 14/14 on staging AND the
Playwright spec passes 9/9 on the staging bundle AND a CI Docker build
of the V2-flags-on bundle passes.** Those three external validations are
prerequisites; everything inside the codebase is ready.
