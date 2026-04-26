import React from "react";

interface UseTypingIndicatorOptions {
  enabled?: boolean;
  onTyping?: (isTyping: boolean) => void;
  startDelayMs?: number;
  stopDelayMs?: number;
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
  stopDelayMs = 1500,
  heartbeatIntervalMs = 1500,
}: UseTypingIndicatorOptions): UseTypingIndicatorResult => {
  const startTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = React.useRef(false);
  const lastTypingEmitAtRef = React.useRef(0);

  const clearTimers = React.useCallback(() => {
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }

    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const emitTyping = React.useCallback(
    (nextValue: boolean, force = false) => {
      if (!enabled || !onTyping) return;
      if (!force && isTypingRef.current === nextValue) return;

      isTypingRef.current = nextValue;
      lastTypingEmitAtRef.current = Date.now();
      onTyping(nextValue);
    },
    [enabled, onTyping],
  );

  const stopTypingNow = React.useCallback(() => {
    clearTimers();
    emitTyping(false);
  }, [clearTimers, emitTyping]);

  const notifyInput = React.useCallback(
    ({ hasText, isFocused }: TypingInputState) => {
      if (!enabled || !onTyping) return;

      if (!hasText || !isFocused) {
        stopTypingNow();
        return;
      }

      const now = Date.now();
      if (
        isTypingRef.current &&
        now - lastTypingEmitAtRef.current >= heartbeatIntervalMs
      ) {
        emitTyping(true, true);
      }

      if (startTimerRef.current) {
        clearTimeout(startTimerRef.current);
      }

      if (!isTypingRef.current) {
        startTimerRef.current = setTimeout(() => {
          emitTyping(true);
        }, startDelayMs);
      }

      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
      }
      stopTimerRef.current = setTimeout(() => {
        emitTyping(false);
      }, stopDelayMs);
    },
    [
      emitTyping,
      enabled,
      heartbeatIntervalMs,
      onTyping,
      startDelayMs,
      stopDelayMs,
      stopTypingNow,
    ],
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
      clearTimers();
      if (isTypingRef.current && onTyping) {
        onTyping(false);
      }
      isTypingRef.current = false;
    };
  }, [clearTimers, onTyping]);

  return {
    notifyInput,
    notifyBlur,
    stopTypingNow,
  };
};

export default useTypingIndicator;
