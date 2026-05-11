/**
 * Chat experience flags.
 *
 * Post-simplification: the chat path mounts exactly one timeline
 * (`SimpleVirtualizedChatTimeline`) unconditionally. Timeline / scroll
 * owner / legacy flags are gone — only flags for non-timeline concerns
 * remain.
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

export const isChatRtkqMessagesRuntimeEnabled = (): boolean =>
  resolveFlag(
    "VITE_CHAT_RTKQ_MESSAGES_RUNTIME",
    import.meta.env.MODE !== "test",
  );
