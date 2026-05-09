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

const toPx = (value: string, fontSize: number): number => {
  const val = Number.parseFloat(value);
  if (!Number.isFinite(val)) return 0;
  if (value.endsWith("rem")) return val * 16;
  if (value.endsWith("em")) return val * fontSize;
  return val;
};

const getLineHeight = (computedStyle: CSSStyleDeclaration, fallback: number): number => {
  const fontSize = Number.parseFloat(computedStyle.fontSize) || 14;
  const lineHeightStr = computedStyle.lineHeight;

  if (!lineHeightStr || lineHeightStr === "normal") {
    return fontSize * 1.4; // common default
  }

  if (lineHeightStr.endsWith("px")) {
    const parsed = Number.parseFloat(lineHeightStr);
    return Number.isFinite(parsed) ? parsed : fontSize * 1.4;
  }

  const val = Number.parseFloat(lineHeightStr);
  if (!Number.isFinite(val)) return fontSize * 1.4;

  if (lineHeightStr.endsWith("rem")) {
    return val * 16;
  }

  if (lineHeightStr.endsWith("em")) {
    return val * fontSize;
  }

  // unitless multiplier (e.g. "1.3")
  if (!lineHeightStr.includes("px") && !lineHeightStr.includes("rem") && !lineHeightStr.includes("em")) {
    return val * fontSize;
  }

  return fallback;
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
      const fontSize = Number.parseFloat(computedStyle.fontSize) || 14;
      const lineHeight = getLineHeight(computedStyle, fallbackLineHeight);
      
      const verticalPadding =
        toPx(computedStyle.paddingTop, fontSize) +
        toPx(computedStyle.paddingBottom, fontSize);
      const verticalBorder =
        toPx(computedStyle.borderTopWidth, fontSize) +
        toPx(computedStyle.borderBottomWidth, fontSize);

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
    const scrollHeight = textarea.scrollHeight;

    const nextHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
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
