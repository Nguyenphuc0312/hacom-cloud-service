import { useCallback, useEffect, useMemo, useRef } from "react";

export interface UseOtpInputOptions {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  onComplete?: (value: string) => void;
}

export interface UseOtpInputResult {
  digits: string[];
  isComplete: boolean;
  setInputRef: (index: number) => (node: HTMLInputElement | null) => void;
  handleChange: (index: number, value: string) => void;
  handleKeyDown: (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => void;
  handlePaste: (
    index: number,
    event: React.ClipboardEvent<HTMLInputElement>,
  ) => void;
  focusIndex: (index: number) => void;
  clear: () => void;
}

const sanitizeOtp = (value: string, length: number): string =>
  value.replace(/\D/g, "").slice(0, length);

export const useOtpInput = ({
  value,
  onChange,
  length = 6,
  autoFocus = true,
  disabled = false,
  onComplete,
}: UseOtpInputOptions): UseOtpInputResult => {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const sanitizedValue = useMemo(
    () => sanitizeOtp(value, length),
    [length, value],
  );

  const digits = useMemo(
    () => Array.from({ length }, (_, index) => sanitizedValue[index] || ""),
    [length, sanitizedValue],
  );

  const focusIndex = useCallback(
    (index: number) => {
      if (disabled) {
        return;
      }

      const boundedIndex = Math.max(0, Math.min(length - 1, index));
      const node = inputRefs.current[boundedIndex];
      if (!node) {
        return;
      }

      node.focus();
      node.select();
    },
    [disabled, length],
  );

  useEffect(() => {
    if (autoFocus && !disabled && !sanitizedValue) {
      focusIndex(0);
    }
  }, [autoFocus, disabled, focusIndex, sanitizedValue]);

  const commitValue = useCallback(
    (nextValue: string) => {
      const normalized = sanitizeOtp(nextValue, length);
      onChange(normalized);
      if (normalized.length === length && onComplete) {
        onComplete(normalized);
      }
    },
    [length, onChange, onComplete],
  );

  const handleChange = useCallback(
    (index: number, rawValue: string) => {
      if (disabled) {
        return;
      }

      const digit = sanitizeOtp(rawValue, 1);
      const nextDigits = [...digits];
      nextDigits[index] = digit;
      commitValue(nextDigits.join(""));

      if (digit && index < length - 1) {
        focusIndex(index + 1);
      }
    },
    [commitValue, disabled, digits, focusIndex, length],
  );

  const handlePaste = useCallback(
    (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
      if (disabled) {
        return;
      }

      const pastedValue = sanitizeOtp(
        event.clipboardData.getData("text"),
        length,
      );
      if (!pastedValue) {
        return;
      }

      event.preventDefault();
      const nextDigits = [...digits];
      for (
        let offset = 0;
        offset < pastedValue.length && index + offset < length;
        offset += 1
      ) {
        nextDigits[index + offset] = pastedValue[offset] ?? "";
      }

      const mergedValue = nextDigits.join("");
      onChange(mergedValue);
      if (mergedValue.replace(/\D/g, "").length === length && onComplete) {
        onComplete(mergedValue);
      }

      const nextFocusIndex = Math.min(index + pastedValue.length, length - 1);
      focusIndex(nextFocusIndex);
    },
    [disabled, digits, focusIndex, length, onChange, onComplete],
  );

  const handleKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (disabled) {
        return;
      }

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          focusIndex(index - 1);
          return;
        case "ArrowRight":
          event.preventDefault();
          focusIndex(index + 1);
          return;
        case "Home":
          event.preventDefault();
          focusIndex(0);
          return;
        case "End":
          event.preventDefault();
          focusIndex(length - 1);
          return;
        case "Backspace": {
          event.preventDefault();
          const nextDigits = [...digits];
          if (nextDigits[index]) {
            nextDigits[index] = "";
            onChange(nextDigits.join(""));
            focusIndex(index);
            return;
          }

          if (index > 0) {
            nextDigits[index - 1] = "";
            onChange(nextDigits.join(""));
            focusIndex(index - 1);
          }
          return;
        }
        case "Delete": {
          event.preventDefault();
          const nextDigits = [...digits];
          nextDigits[index] = "";
          onChange(nextDigits.join(""));
          focusIndex(index);
          return;
        }
        case "Enter":
          return;
        default:
          return;
      }
    },
    [disabled, digits, focusIndex, length, onChange],
  );

  const setInputRef = useCallback(
    (index: number) => (node: HTMLInputElement | null) => {
      inputRefs.current[index] = node;
    },
    [],
  );

  const clear = useCallback(() => {
    onChange("");
    focusIndex(0);
  }, [focusIndex, onChange]);

  return {
    digits,
    isComplete: sanitizedValue.length === length,
    setInputRef,
    handleChange,
    handleKeyDown,
    handlePaste,
    focusIndex,
    clear,
  };
};

export default useOtpInput;
