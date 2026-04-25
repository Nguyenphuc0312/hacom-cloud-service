import React from "react";

interface UseAutoResizeTextareaOptions {
  value: string;
  minRows?: number;
  maxRows?: number;
  fallbackLineHeight?: number;
}

interface UseAutoResizeTextareaResult {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  recomputeHeight: () => void;
}

const DEFAULT_LINE_HEIGHT = 20;

interface TextareaSizingMetrics {
  minHeight: number;
  maxHeight: number;
}

const toNumber = (input: string): number => {
  const parsed = Number.parseFloat(input);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const useAutoResizeTextarea = ({
  value,
  minRows = 1,
  maxRows = 6,
  fallbackLineHeight = DEFAULT_LINE_HEIGHT,
}: UseAutoResizeTextareaOptions): UseAutoResizeTextareaResult => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const metricsRef = React.useRef<TextareaSizingMetrics | null>(null);
  const frameRef = React.useRef<number | null>(null);

  const readSizingMetrics = React.useCallback(
    (textarea: HTMLTextAreaElement): TextareaSizingMetrics => {
      const cached = metricsRef.current;
      if (cached) {
        return cached;
      }

      const computedStyle = window.getComputedStyle(textarea);
      const lineHeight =
        toNumber(computedStyle.lineHeight) || fallbackLineHeight;
      const verticalPadding =
        toNumber(computedStyle.paddingTop) +
        toNumber(computedStyle.paddingBottom);
      const verticalBorder =
        toNumber(computedStyle.borderTopWidth) +
        toNumber(computedStyle.borderBottomWidth);

      const metrics = {
        minHeight: minRows * lineHeight + verticalPadding + verticalBorder,
        maxHeight: maxRows * lineHeight + verticalPadding + verticalBorder,
      };
      metricsRef.current = metrics;
      return metrics;
    },
    [fallbackLineHeight, maxRows, minRows],
  );

  const recomputeHeight = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { minHeight, maxHeight } = readSizingMetrics(textarea);

    textarea.style.height = "auto";
    const nextHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [readSizingMetrics]);

  const scheduleRecomputeHeight = React.useCallback(() => {
    if (
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      recomputeHeight();
      return;
    }

    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      recomputeHeight();
    });
  }, [recomputeHeight]);

  React.useLayoutEffect(() => {
    scheduleRecomputeHeight();
  }, [scheduleRecomputeHeight, value]);

  React.useLayoutEffect(() => {
    metricsRef.current = null;
    scheduleRecomputeHeight();
  }, [fallbackLineHeight, maxRows, minRows, scheduleRecomputeHeight]);

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      metricsRef.current = null;
      scheduleRecomputeHeight();
    });
    observer.observe(textarea);

    return () => {
      observer.disconnect();
    };
  }, [scheduleRecomputeHeight]);

  React.useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  return { textareaRef, recomputeHeight };
};

export default useAutoResizeTextarea;
