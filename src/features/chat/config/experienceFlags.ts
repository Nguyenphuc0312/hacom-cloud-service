/**
 * Chat experience flags — runtime-resolved.
 *
 * Post-cleanup (2026-05): the production chat path mounts exactly one
 * timeline (`SimpleVirtualizedChatTimeline`). The V2 owner / drives flags
 * are gone from the production decision tree. Only one emergency-rollback
 * flag remains:
 *
 *   VITE_CHAT_USE_LEGACY_TIMELINE=true   → mount legacy MessageList only.
 *
 * Every flag is read through `resolveFlag()` at *call time* (not at module
 * load) so that:
 *
 *   - `globalThis.__CHAT_FLAGS_OVERRIDE__` set from index.html, devtools,
 *     or Playwright `addInitScript` reliably wins even when the module
 *     that uses the flag was imported before the override was assigned.
 *   - A session-level kill-switch (`disableChatFlagForSession`) can flip a
 *     flag off mid-session without a redeploy.
 *
 * Precedence (highest first):
 *   1. session kill-switch (`__CHAT_FLAGS_SESSION_KILL__[key] === "false"`)
 *   2. runtime override   (`__CHAT_FLAGS_OVERRIDE__[key]`)
 *   3. build-time env     (`import.meta.env[key]`)
 *   4. hard-coded fallback
 */

type ChatFlagsOverride = Record<string, "true" | "false">;

const resolveBooleanFlag = (
  envValue: string | undefined,
  fallback: boolean,
): boolean => {
  if (envValue === "true") return true;
  if (envValue === "false") return false;
  return fallback;
};

const readBucket = (
  bucketKey: "__CHAT_FLAGS_OVERRIDE__" | "__CHAT_FLAGS_SESSION_KILL__",
  key: string,
): string | undefined => {
  if (typeof globalThis === "undefined") return undefined;
  const bucket = (globalThis as Record<string, unknown>)[bucketKey] as
    | ChatFlagsOverride
    | undefined;
  if (!bucket) return undefined;
  return bucket[key];
};

/**
 * Mid-session kill-switch. Subsequent `is*Enabled()` calls for `key` return
 * false regardless of env or override. Available for future emergencies;
 * the post-cleanup production tree does not currently call this.
 */
export const disableChatFlagForSession = (key: string): void => {
  if (typeof globalThis === "undefined") return;
  const g = globalThis as Record<string, unknown>;
  const existing = (g.__CHAT_FLAGS_SESSION_KILL__ as ChatFlagsOverride) ?? {};
  existing[key] = "false";
  g.__CHAT_FLAGS_SESSION_KILL__ = existing;
};

const envValue = (key: string): string | undefined =>
  (import.meta.env as Record<string, string | undefined>)[key];

const resolveFlag = (envKey: string, fallback: boolean): boolean => {
  const kill = readBucket("__CHAT_FLAGS_SESSION_KILL__", envKey);
  if (kill === "false") return false;
  const override = readBucket("__CHAT_FLAGS_OVERRIDE__", envKey);
  return resolveBooleanFlag(override ?? envValue(envKey), fallback);
};

// ─── Production decision tree ──────────────────────────────────────────────

/**
 * Production timeline. Defaults to TRUE — `SimpleVirtualizedChatTimeline`
 * is the only timeline the production path mounts.
 *
 * Disabling this WITHOUT also enabling `VITE_CHAT_USE_LEGACY_TIMELINE` is
 * not a supported state; routing falls back to legacy in that case purely
 * as a safety net.
 */
export const isChatSimpleVirtualTimelineEnabled = (): boolean =>
  resolveFlag("VITE_CHAT_SIMPLE_VIRTUAL_TIMELINE", true);

/**
 * Emergency rollback to the legacy MessageList. Default FALSE.
 *
 * TODO(remove by 2026-06-30): Delete this flag and the MessageList code
 * path once the simple timeline has been stable in production for two
 * release cycles. Until then, oncall can flip this to true to revert
 * without a code change.
 */
export const isChatUseLegacyTimelineEnabled = (): boolean =>
  resolveFlag("VITE_CHAT_USE_LEGACY_TIMELINE", false);

export const isChatSimpleTimelineDebugEnabled = (): boolean =>
  resolveFlag("VITE_CHAT_SIMPLE_TIMELINE_DEBUG", false);

// ─── Unrelated, kept for non-timeline consumers ───────────────────────────

export const isChatTimelineV2Enabled = (): boolean =>
  resolveFlag("VITE_CHAT_TIMELINE_V2", true);

export const isChatScrollMachineV2Enabled = (): boolean =>
  resolveFlag("VITE_CHAT_SCROLL_MACHINE_V2", isChatTimelineV2Enabled());

export const isChatRtkqMessagesRuntimeEnabled = (): boolean =>
  resolveFlag(
    "VITE_CHAT_RTKQ_MESSAGES_RUNTIME",
    import.meta.env.MODE !== "test",
  );

export const isChatScrollDebugEnabled = (): boolean =>
  resolveFlag("VITE_CHAT_SCROLL_DEBUG", false);
