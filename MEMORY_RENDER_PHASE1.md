# MEMORY_RENDER_PHASE1

Date: 2026-07-03

Scope: P0 render bottleneck fix verification for presence/online animation and TipTap duplicate Link extension warning in `chat-web-client`.

## Files Changed

This pass added regression coverage and documentation:

- `src/components/input/TipTapEditor.test.tsx`
- `MEMORY_RENDER_PHASE1.md`

Runtime files audited and confirmed to already contain the target behavior:

- `src/components/common/Avatar.tsx`
- `src/components/common/Avatar.test.tsx`
- `src/components/chat/ChatHeader.tsx`
- `src/components/layout/sidebar/RoomItem.tsx`
- `src/components/chat/thread/MessageGroup.tsx`
- `src/components/input/TipTapEditor.tsx`
- `tailwind.config.js`
- `.env.example`
- `.env.production`

## Before / After Behavior

| Area | Before from reported evidence | Current after behavior |
| --- | --- | --- |
| Online indicator in large lists | `bg-state-online animate-pulse-online` appeared in many avatar/status-dot surfaces and produced high paint work. | `Avatar` defaults `presenceAnimation` to `"none"`, so sidebar/list/message avatars render visible static online dots with `bg-state-online` and no pulse class. |
| Active conversation header | Same shared avatar behavior could animate anywhere the status dot appeared. | Only the active direct chat header opts into `presenceAnimation="recent-online"`. |
| Recently-online transition | Animation was effectively broad/infinite from shared class usage. | A status transition to online sets `recentlyOnline` for 4 seconds, then disables the pulse. |
| Reduced motion | Broad animation risk existed wherever the class was present. | Remaining pulse uses `motion-safe:animate-pulse-online`, so it respects `prefers-reduced-motion`. |
| Animation properties | Trace pointed to paint-heavy online pulse. | `pulseOnline` keyframes use only `opacity` and `transform`; no `box-shadow`, `filter`, background, width, or height animation. |
| Perf measurement kill switch | No explicit flag in the reported trace. | `VITE_DISABLE_PRESENCE_ANIMATION=true` disables all presence pulse logic. |
| TipTap composer | Runtime verification reported `[tiptap warn]: Duplicate extension names found: ['link']`. | `StarterKit.configure({ link: false })` disables StarterKit's built-in Link before registering a single explicit `Link.configure(...)`. Extension list is memoized once, so conversation switches/remounts do not duplicate it. |

## Animation Scope Kept

Animation is intentionally kept only in this narrow path:

- `src/components/chat/ChatHeader.tsx`: direct active conversation avatar passes `presenceAnimation="recent-online"`.
- `src/components/common/Avatar.tsx`: animation applies only when:
  - `VITE_DISABLE_PRESENCE_ANIMATION !== "true"`;
  - status is `UserStatus.ONLINE`;
  - `presenceAnimation` is `"active"` or `"recent-online"` during the short recently-online window.

The following high-cardinality surfaces do not opt into presence animation:

- `src/components/layout/sidebar/RoomItem.tsx`
- `src/components/chat/thread/MessageGroup.tsx`
- other default `Avatar showStatus` callers unless they explicitly pass `presenceAnimation`.

## Env Flag

Disable all presence animation for clean paint/runtime traces:

```env
VITE_DISABLE_PRESENCE_ANIMATION=true
```

Default in templates:

```env
VITE_DISABLE_PRESENCE_ANIMATION=false
```

## TipTap Duplicate Link Warning

Current editor extension setup:

- `src/components/input/TipTapEditor.tsx` imports `StarterKit` and `Link`.
- `StarterKit.configure({ link: false })` prevents StarterKit from registering Link.
- A single `Link.configure(...)` registers autolink/link-on-paste behavior.
- The extension array is wrapped in `React.useMemo(..., [])`; changing placeholder or switching conversation does not create a duplicate extension list.

Targeted regression added:

- `src/components/input/TipTapEditor.test.tsx`
  - mounts the editor;
  - unmounts it;
  - mounts it again as a conversation-switch proxy;
  - asserts no `Duplicate extension names found` console warning was emitted.

Result: duplicate `link` warning is not reproduced in the targeted regression.

## Verification

Passed:

```powershell
node .\node_modules\vitest\vitest.mjs run src\components\common\Avatar.test.tsx src\components\input\TipTapEditor.test.tsx
npm run typecheck
npm run build
```

Build warnings observed are existing Vite/Rollup warnings:

- circular re-export warnings around `src/components/ui/EmptyState.tsx` via `src/components/ui/index.ts`;
- mixed dynamic/static import warning for `src/lib/apiContract.ts`;
- large chunk warning.

## Pass Criteria Mapping

| Criterion | Status |
| --- | --- |
| No `animate-pulse-online` in conversation list/sidebar/message avatar by default | PASS |
| Online dot remains visible and static by default | PASS |
| Remaining animation is narrowly scoped | PASS |
| `prefers-reduced-motion` respected | PASS via `motion-safe:` |
| Remaining animation uses opacity/transform only | PASS |
| `VITE_DISABLE_PRESENCE_ANIMATION=true` disables all presence pulse | PASS |
| TipTap duplicate Link extension warning covered by targeted regression | PASS |
| Build pass | PASS |
