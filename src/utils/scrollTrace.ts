import { isMessageDebugEnabled, logMessageDebug } from "./messageDebug";
import { isChatScrollDebugEnabled } from "../features/chat/config/experienceFlags";

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
  // Read through the shared resolver so devtools / Playwright overrides
  // and the session kill-switch are honored (was: direct import.meta.env).
  const shouldLog =
    (import.meta.env.DEV && isChatScrollDebugEnabled()) ||
    isMessageDebugEnabled();
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
