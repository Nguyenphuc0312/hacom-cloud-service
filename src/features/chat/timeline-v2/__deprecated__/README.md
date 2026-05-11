# Timeline V2 — DEPRECATED (2026-05)

Replaced by `SimpleVirtualizedChatTimeline` after the 2026-05 production
incident (scroll lock, message-jump, runaway scroll commands).

**Do not import from production code.** ConversationViewport no longer
routes here. The files are kept solely to preserve git history and let the
in-tree unit tests continue to pass as historical reference until removed.

If you are tempted to revive any of this — don't. The simpler timeline in
`src/features/chat/simple-virtual-timeline/` is the supported path. The
post-cleanup decision tree is:

- default → `SimpleVirtualizedChatTimeline`
- `VITE_CHAT_USE_LEGACY_TIMELINE=true` → legacy `MessageList` (emergency
  rollback only; remove by 2026-06-30)

What lived here:

- `ChatTimelineV2.tsx` — wrapper around legacy MessageList that mounted
  ScrollOwnerV2 + bridge.
- `useChatScrollOwnerV2.ts` — single-owner React hook with state machine +
  command queue + (post-incident) kill-switch & loop guards.
- `scrollStateMachine.ts` / `scrollCommandQueue.ts` — pure machine + queue.
- `useScrollEventBridge.ts` — DOM scroll → machine bridge.
- `domScrollAdapter.ts` / `virtualizerAdapter.ts` — scroll adapter
  implementations.
- `messageChangeClassifier.ts` — message-array diff classifier.
- `scrollDebug.ts` / `scrollTypes.ts` — local debug + types.
- `TIMELINE_V2_ROLLOUT.md` — staged rollout playbook (now historical).
