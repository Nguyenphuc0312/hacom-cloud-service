import React from "react";

interface UseTypingIndicatorOptions {
  enabled?: boolean;
  onTyping?: (isTyping: boolean) => void;
  startDelayMs?: number;
  heartbeatIntervalMs?: number;
}

interface TypingInputState {
  hasText: boolean;
  isFocused: boolean;
}

interface UseTypingIndicatorResult {
  notifyInput: (state: TypingInputState) => void;
  notifyBlur: () => void;
  stopTypingNow: () => void;
}

export const useTypingIndicator = ({
  enabled = true,
  onTyping,
  startDelayMs = 250,
  heartbeatIntervalMs = 2500,
}: UseTypingIndicatorOptions): UseTypingIndicatorResult => {
  const startTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const isTypingRef = React.useRef(false);

  const clearHeartbeat = React.useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const emitTyping = React.useCallback(
    (nextValue: boolean, force = false) => {
      if (!enabled || !onTyping) return;
      if (!force && isTypingRef.current === nextValue) return;

      isTypingRef.current = nextValue;
      onTyping(nextValue);

      if (nextValue) {
        // Start heartbeat to keep typing status alive while user has text
        clearHeartbeat();
        heartbeatRef.current = setInterval(() => {
          if (isTypingRef.current && onTyping) {
            onTyping(true);
          }
        }, heartbeatIntervalMs);
      } else {
        clearHeartbeat();
      }
    },
    [clearHeartbeat, enabled, heartbeatIntervalMs, onTyping],
  );

  const stopTypingNow = React.useCallback(() => {
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    emitTyping(false);
  }, [emitTyping]);

  const notifyInput = React.useCallback(
    ({ hasText, isFocused }: TypingInputState) => {
      if (!enabled || !onTyping) return;

      if (!hasText || !isFocused) {
        stopTypingNow();
        return;
      }

      // Already typing — heartbeat keeps the remote status alive, nothing more to do
      if (isTypingRef.current) return;

      // Not yet typing — schedule the start event
      if (startTimerRef.current) {
        clearTimeout(startTimerRef.current);
      }
      startTimerRef.current = setTimeout(() => {
        emitTyping(true);
      }, startDelayMs);
    },
    [emitTyping, enabled, onTyping, startDelayMs, stopTypingNow],
  );

  const notifyBlur = React.useCallback(() => {
    stopTypingNow();
  }, [stopTypingNow]);

  React.useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopTypingNow();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [stopTypingNow]);

  React.useEffect(() => {
    return () => {
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      clearHeartbeat();
      if (isTypingRef.current && onTyping) {
        onTyping(false);
      }
      isTypingRef.current = false;
    };
  }, [clearHeartbeat, onTyping]);

  return {
    notifyInput,
    notifyBlur,
    stopTypingNow,
  };
};

export default useTypingIndicator;
