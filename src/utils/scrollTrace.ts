import { logMessageDebug } from "./messageDebug";

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
  logMessageDebug("chatScroll", event, {
    ...details,
    stack: getScrollTraceStack(),
  });
};

export default logScrollTrace;
