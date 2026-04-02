type MessageDebugEvent = {
  ts: string;
  scope: string;
  event: string;
  details?: Record<string, unknown>;
};

type MessageDebugWindow = Window & {
  __chatMessageDebugEvents?: MessageDebugEvent[];
};

export const isMessageDebugEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get("debugMessages") === "1"
  );
};

export const logMessageDebug = (
  scope: string,
  event: string,
  details?: Record<string, unknown>,
): void => {
  if (!isMessageDebugEnabled()) {
    return;
  }

  const entry: MessageDebugEvent = {
    ts: new Date().toISOString(),
    scope,
    event,
    details,
  };

  if (typeof window !== "undefined") {
    const debugWindow = window as MessageDebugWindow;
    const existing = debugWindow.__chatMessageDebugEvents ?? [];
    const nextEvents = [...existing, entry];
    debugWindow.__chatMessageDebugEvents = nextEvents.slice(-300);
  }

  console.debug("[chat-debug]", entry);
};
