# MEMORY_RENDER_AUDIT

## Scope

Phase 3 production render/memory bottleneck audit for `chat-web-client`.

Inputs:

- `MEMORY_AUDIT.md`
- `MEMORY_RUNTIME_VERIFICATION.md`
- Prior production Chrome trace summary provided in the task
- Fresh clean Chrome trace after the presence-animation fix

This phase did not continue optimizing message cache first. The bounded mock
runtime result remains accepted: RTK Query message cache, blob preview cache,
WebSocket listener count, and JS heap did not show a clear linear leak in the
existing mock verification.

## Prior Production Trace Signal

Exact raw production trace JSON was not available in this workspace during this
run, so exact old counts for Paint / DroppedFrame / AnimationFrame are
`CHUA XAC MINH` here. The prior trace summary provided these confirmed signals:

| Metric / signal | Prior production trace |
| --- | ---: |
| DOM nodes | about 8.8k -> 14.6k |
| Paint events | very high |
| DroppedFrame | high |
| AnimationFrame | high |
| Top paint node class | `bg-state-online animate-pulse-online` |

## Fresh Trace After Fix

Environment:

- Date: 2026-07-03
- Browser: system Chrome headless with `--disable-extensions`
- App: production build served by Vite preview
- Data: local mocked authenticated direct-conversation fixture
- Viewport: 1440 x 960
- Trace window: 5s idle after chat render

Control baseline:

- Because the raw old production trace was not available, I emulated the old
  `bg-state-online animate-pulse-online` behavior on the same route by applying
  the previous infinite `box-shadow` pulse to rendered online dots.

| Metric | Old pulse emulation | After static default |
| --- | ---: | ---: |
| Paint events | 2,988 | 0 |
| DroppedFrame events | 8 | 0 |
| AnimationFrame events | 13,437 | 60 |
| UpdateLayoutTree events | 1,493 | 0 |
| DOM nodes | 1,266 | 1,265 |
| JS event listeners | 257 | 233 |
| Animated online dots | 1 | 0 |
| WebSocket listeners | 71 | 71 |
| RTKQ messages | 50 | 50 |
| Zustand messages | 0 | 0 |
| Blob preview cache | 0 | 0 |
| JS heap used | 14.87 MB | 14.77 MB |

The rebuilt after-trace also confirmed:

| Render probe metric | Count |
| --- | ---: |
| mounted MessageItem | 20 |
| mounted ConversationItem | 23 |
| mounted PresenceDot | 25 |
| mounted Tooltip/Popover | 0 |

Console health:

- After rebuild: no TipTap duplicate Link warning.
- No page error recorded in the after trace.

## Root Cause

Confirmed:

- `Avatar` previously applied `animate-pulse-online` to every online status dot
  whenever `showStatus` was true.
- The animation used `box-shadow` and ran infinitely.
- Sidebar/list/profile/header callers share `Avatar`, so one implementation
  detail fanned out across many rendered avatar/status surfaces.
- Emulated old pulse on the same rendered route produced thousands of Paint and
  AnimationFrame trace events during a 5s idle window.

Fixed:

- Presence dots are static by default.
- Animation is opt-in via `presenceAnimation`.
- Active chat header uses a short `recent-online` mode only when status
  transitions to online.
- `VITE_DISABLE_PRESENCE_ANIMATION=true` disables all presence animation.
- Remaining animation is guarded by `motion-safe:` for `prefers-reduced-motion`.
- Tailwind `pulseOnline` now uses only `opacity` and `transform`, not
  `box-shadow`, background, size, or filter.

Suspected / still needs production trace confirmation:

- Production DOM growth from about 8.8k to 14.6k is not reproduced by the mock
  route. The local after route stayed near 1.2k DOM nodes.
- If production still reaches 14k nodes, likely contributors are real open
  drawers/modals, long direct/group conversation lists, richer message bodies,
  or production-only panels/content, not the bounded mock message cache.

## DOM / Listener Audit

Conversation list:

- `RoomList` uses `react-window` when items exceed `VIRTUALIZATION_THRESHOLD`
  of 10.
- Overscan is 12 rows.
- Non-virtual branch renders all rows only when item count is 10 or less.
- After trace rendered 23 conversation rows from a 40-conversation fixture.

Message timeline:

- `SimpleVirtualizedChatTimeline` uses `@tanstack/react-virtual`.
- Overscan is 8 rows.
- After trace rendered 20 message items from 50 cached messages.

Hidden drawers / panels:

- Chat info panel content is gated by `shouldRenderInfoContent`.
- Content is not mounted while closed; the transition wrapper can remain for
  layout animation.
- Modal/profile portals are conditional on open state.

Tooltip / popover:

- No mounted tooltip/popover was present in the after idle trace.
- Hot-path hover action bars use React event props on mounted message rows; the
  row count is bounded by timeline virtualization in the measured route.

Window/document listeners:

- Existing code generally has cleanup for resize, visibility, focus, online,
  keydown, mousedown, and scroll listeners in inspected files.
- After trace listener count was lower than old-pulse emulation and did not
  grow in the idle window.
- Previous `MEMORY_RUNTIME_VERIFICATION.md` still provides the switch-20 and
  reconnect evidence: DOM nodes stayed stable and WebSocket listeners stayed
  flat in mock runtime.

## Files Changed

- `.env.example`
- `.env.production`
- `src/components/common/Avatar.tsx`
- `src/components/common/Avatar.test.tsx`
- `src/components/chat/ChatHeader.tsx`
- `src/components/chat/MessageItem/MessageItemWrapper.tsx`
- `src/components/chat/thread/MessageGroup.tsx`
- `src/components/input/TipTapEditor.tsx`
- `src/components/layout/sidebar/RoomItem.tsx`
- `src/utils/memoryRuntimeProbe.ts`
- `tailwind.config.js`

Note: `src/main.tsx` already contained the dev probe install change before this
phase started; it was not edited in this phase.

## Verification

Commands run:

```powershell
rtk powershell -Command "& 'C:\Program Files\nodejs\node.exe' .\node_modules\vitest\vitest.mjs run src\components\common\Avatar.test.tsx"
rtk powershell -Command "& 'C:\Program Files\nodejs\npm.cmd' run typecheck"
rtk powershell -Command "& 'C:\Program Files\nodejs\npm.cmd' run build"
```

Results:

- Avatar focused test: PASS, 8 tests.
- Typecheck: PASS.
- Build: PASS.
- Build warnings: existing Rollup/chunk warnings around `EmptyState` reexports,
  dynamic/static imports, and large chunks.

## Pass / Fail Criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| Paint events reduce clearly | PASS | 2,988 -> 0 in clean trace control |
| DroppedFrame reduce clearly | PASS | 8 -> 0 |
| AnimationFrame reduce clearly | PASS | 13,437 -> 60 |
| DOM nodes do not grow linearly on switch 20 conversations | PASS from prior mock runtime | `MEMORY_RUNTIME_VERIFICATION.md` stayed stable around 1,447 in switch/reconnect scenarios |
| Event listeners do not grow linearly | PASS from prior mock runtime + after trace | WS listeners stayed flat previously; after trace WS listeners 71 |
| JS heap remains bounded | PASS from prior mock runtime + after trace | After trace heap about 14.77 MB; prior mock runtime did not show clear linear leak |
| Realtime/chat composer not broken | PASS in mock route | Composer rendered, WS mock connected, RTKQ messages loaded |
| Raw production DOM 8.8k -> 14.6k reproduced locally | FAIL / CHUA XAC MINH | Mock route stayed 1,265 DOM nodes; needs live production trace rerun |

## Next Production Probe

Run the live production Chrome trace again with:

- `VITE_DISABLE_PRESENCE_ANIMATION=false` for normal production behavior after
  this patch.
- `VITE_DISABLE_PRESENCE_ANIMATION=true` for measurement isolation.

Compare:

- DOM node count by route state.
- `data-render-probe='message-item'`.
- `data-render-probe='conversation-item'`.
- `data-render-probe='presence-dot'`.
- tooltip/popover count.
- WebSocket listener count.
- RTKQ/Zustand message totals.
- blob preview cache size.

If DOM still reaches 14k, the next fix should target the surface identified by
the render probe counts rather than message cache.
