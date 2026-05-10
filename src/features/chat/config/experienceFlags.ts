const resolveBooleanFlag = (
  envValue: string | undefined,
  fallback: boolean,
): boolean => {
  if (envValue === "true") return true;
  if (envValue === "false") return false;
  return fallback;
};

/**
 * Runtime flag override hook.
 *
 * `import.meta.env.VITE_*` values are baked at build time, so a single
 * deployed bundle cannot toggle flags per-session. Two scenarios need
 * runtime override:
 *   1. Playwright E2E uses `page.addInitScript` to enable Timeline V2
 *      without spinning up a separate dev build per spec.
 *   2. On-call engineers debugging staging can toggle flags from devtools
 *      without redeploying.
 *
 * The override mechanism reads from `globalThis.__CHAT_FLAGS_OVERRIDE__` —
 * a plain `Record<string, "true" | "false">` keyed by the env var name
 * (e.g. "VITE_CHAT_TIMELINE_V2_OWNER"). When the key is absent or the
 * global is not set, behavior is identical to pre-override (build-time
 * env wins). Production bundles that never set the global behave exactly
 * as before.
 */
type ChatFlagsOverride = Record<string, "true" | "false">;

const readOverride = (key: string): string | undefined => {
  if (typeof globalThis === "undefined") return undefined;
  const bucket = (globalThis as { __CHAT_FLAGS_OVERRIDE__?: ChatFlagsOverride })
    .__CHAT_FLAGS_OVERRIDE__;
  if (!bucket) return undefined;
  return bucket[key];
};

const resolveFlag = (
  envKey: string,
  envValue: string | undefined,
  fallback: boolean,
): boolean => resolveBooleanFlag(readOverride(envKey) ?? envValue, fallback);

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
export const CHAT_TIMELINE_V2_OWNER_ENABLED = resolveFlag(
  "VITE_CHAT_TIMELINE_V2_OWNER",
  import.meta.env.VITE_CHAT_TIMELINE_V2_OWNER,
  false,
);

/**
 * When true (and V2 owner is mounted), the V2 ScrollOwner DRIVES scroll —
 * the legacy `useChatScrollController`'s scrollToOffset/scrollToIndex
 * callbacks are wrapped to no-op so only V2 issues commands. Also activates
 * the V2 scroll-event bridge so user-scroll events flow into the V2 state
 * machine.
 *
 * Implies CHAT_TIMELINE_V2_OWNER_ENABLED. Defaults to FALSE because
 * dogfood (owner-only) and full cutover (owner-drives) are separate stages
 * in the rollout. Production should flip OWNER first, observe, then
 * DRIVES.
 */
export const CHAT_SCROLL_OWNER_V2_DRIVES_ENABLED = resolveFlag(
  "VITE_CHAT_SCROLL_OWNER_V2_DRIVES",
  import.meta.env.VITE_CHAT_SCROLL_OWNER_V2_DRIVES,
  false,
);
