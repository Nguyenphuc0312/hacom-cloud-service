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
