import { isMessageDebugEnabled, logMessageDebug } from "./messageDebug";

const getScrollTraceStack = (): string | undefined => {
  const stack = new Error().stack;
  if (!stack) return undefined;

  return stack
    .split("\n")
    .slice(2, 8)
    .map((line) => line.trim())
    .join(" <- ");
};

export const logScrollTrace = (
  event: string,
  details?: Record<string, unknown>,
): void => {
  const envScrollDebugEnabled =
    import.meta.env.DEV && import.meta.env.VITE_CHAT_SCROLL_DEBUG === "true";
  const shouldLog = envScrollDebugEnabled || isMessageDebugEnabled();
  if (!shouldLog) {
    return;
  }

  logMessageDebug(
    "chatScroll",
    event,
    {
      ...details,
      stack: getScrollTraceStack(),
    },
    {
      alwaysOn: true,
    },
  );
};

export default logScrollTrace;
