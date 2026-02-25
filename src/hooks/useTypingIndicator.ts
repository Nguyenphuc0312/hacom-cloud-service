import React from "react";

interface UseTypingIndicatorOptions {
  enabled?: boolean;
  onTyping?: (isTyping: boolean) => void;
  startDelayMs?: number;
  stopDelayMs?: number;
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
  stopDelayMs = 2000,
}: UseTypingIndicatorOptions): UseTypingIndicatorResult => {
  const startTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = React.useRef(false);

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
    (nextValue: boolean) => {
      if (!enabled || !onTyping) return;
      if (isTypingRef.current === nextValue) return;

      isTypingRef.current = nextValue;
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
    [emitTyping, enabled, onTyping, startDelayMs, stopDelayMs, stopTypingNow],
  );

  const notifyBlur = React.useCallback(() => {
    stopTypingNow();
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
