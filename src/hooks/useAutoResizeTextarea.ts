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

  const recomputeHeight = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = toNumber(computedStyle.lineHeight) || fallbackLineHeight;
    const verticalPadding =
      toNumber(computedStyle.paddingTop) + toNumber(computedStyle.paddingBottom);
    const verticalBorder =
      toNumber(computedStyle.borderTopWidth) + toNumber(computedStyle.borderBottomWidth);

    const minHeight = minRows * lineHeight + verticalPadding + verticalBorder;
    const maxHeight = maxRows * lineHeight + verticalPadding + verticalBorder;

    textarea.style.height = "auto";
    const nextHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [fallbackLineHeight, maxRows, minRows]);

  React.useLayoutEffect(() => {
    recomputeHeight();
  }, [recomputeHeight, value]);

  return { textareaRef, recomputeHeight };
};

export default useAutoResizeTextarea;
