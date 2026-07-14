const restoreSelection = (selection: Selection | null, ranges: Range[]): void => {
  if (!selection) return;
  selection.removeAllRanges();
  for (const range of ranges) {
    selection.addRange(range);
  }
};

const fallbackCopyText = (text: string): boolean => {
  if (typeof document === "undefined") {
    return false;
  }

  const activeElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const selection =
    typeof window !== "undefined" ? window.getSelection() : null;
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) =>
        selection.getRangeAt(index).cloneRange(),
      )
    : [];
  const scrollingElement = document.scrollingElement;
  const scrollLeft = scrollingElement?.scrollLeft ?? 0;
  const scrollTop = scrollingElement?.scrollTop ?? 0;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.tabIndex = -1;
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);

  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    const copied = document.execCommand("copy");
    restoreSelection(selection, ranges);
    activeElement?.focus({ preventScroll: true });
    if (scrollingElement) {
      scrollingElement.scrollTo({ left: scrollLeft, top: scrollTop });
    }
    return copied;
  } catch {
    restoreSelection(selection, ranges);
    activeElement?.focus({ preventScroll: true });
    if (scrollingElement) {
      scrollingElement.scrollTo({ left: scrollLeft, top: scrollTop });
    }
    return false;
  } finally {
    textarea.remove();
  }
};

export const copyTextToClipboard = async (value: string): Promise<boolean> => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return false;
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the DOM fallback. Some desktop webviews expose the API
    // but reject it outside a secure context or without permission.
  }

  return fallbackCopyText(text);
};
