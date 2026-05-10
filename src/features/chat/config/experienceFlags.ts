const resolveBooleanFlag = (
  envValue: string | undefined,
  fallback: boolean,
): boolean => {
  if (envValue === "true") return true;
  if (envValue === "false") return false;
  return fallback;
};

export const CHAT_TIMELINE_V2_ENABLED = resolveBooleanFlag(
  import.meta.env.VITE_CHAT_TIMELINE_V2,
  true,
);

export const CHAT_SCROLL_MACHINE_V2_ENABLED = resolveBooleanFlag(
  import.meta.env.VITE_CHAT_SCROLL_MACHINE_V2,
  CHAT_TIMELINE_V2_ENABLED,
);

export const CHAT_RTKQ_MESSAGES_RUNTIME_ENABLED = resolveBooleanFlag(
  import.meta.env.VITE_CHAT_RTKQ_MESSAGES_RUNTIME,
  import.meta.env.MODE !== "test",
);

/**
 * Timeline V2 scroll-owner switch. When true, ConversationViewport renders
 * `<ChatTimelineV2>` (Phase 1 wraps the legacy MessageList while the V2
 * scroll owner dogfoods its state-machine and command-queue logic).
 *
 * Defaults to FALSE so production keeps the legacy render path until V2 is
 * verified end-to-end. Independent from `CHAT_TIMELINE_V2_ENABLED`, which is
 * a legacy heuristic flag inside timelinePlanner.ts / scrollController.ts
 * and must NOT be repurposed for the render-path switch.
 */
export const CHAT_TIMELINE_V2_OWNER_ENABLED = resolveBooleanFlag(
  import.meta.env.VITE_CHAT_TIMELINE_V2_OWNER,
  false,
);
