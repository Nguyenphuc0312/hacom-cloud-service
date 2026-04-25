import React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  ConversationVirtualItem,
  ConversationVirtualizerAlign,
  ConversationVirtualizerMeasurementResult,
  ConversationVirtualizerOffsetMatch,
  ConversationVirtualizerScrollBehavior,
} from "./virtualizerContract";
import { useVirtualizedMessages } from "./useVirtualizedMessages";

const PROGRAMMATIC_SCROLL_MATCH_THRESHOLD_PX = 12;
const PROGRAMMATIC_SCROLL_TTL_MS = 320;

interface UseTanStackVirtualizedMessagesParams<Item> {
  items: Item[];
  viewportRef: React.RefObject<HTMLDivElement | null>;
  outerRef?: React.MutableRefObject<HTMLDivElement | null>;
  observeViewport?: boolean;
  enabled?: boolean;
  debugLabel?: string;
  overscan?: number;
  estimateItemSize: (item: Item) => number;
  getItemKey: (item: Item, index: number) => string;
  getMeasurementKey?: (item: Item, index: number) => string;
  shouldResetAfterSizeChange?: (item: Item, index: number) => boolean;
}

interface UseTanStackVirtualizedMessagesResult {
  outerRef: React.MutableRefObject<HTMLDivElement | null>;
  viewportHeight: number;
  virtualItems: ConversationVirtualItem[];
  totalSize: number;
  getItemSize: (index: number) => number;
  getItemOffset: (index: number) => number;
  findItemAtOffset: (
    scrollOffset: number,
  ) => ConversationVirtualizerOffsetMatch | null;
  setItemSize: (
    index: number,
    size: number,
  ) => ConversationVirtualizerMeasurementResult;
  clearMeasuredSizes: () => void;
  resetMeasurements: () => void;
  scrollToOffset: (
    offset: number,
    behavior?: ConversationVirtualizerScrollBehavior,
  ) => void;
  scrollToIndex: (
    index: number,
    align?: ConversationVirtualizerAlign,
    behavior?: ConversationVirtualizerScrollBehavior,
  ) => void;
  measureIndex: (index: number) => void;
  consumeProgrammaticScroll: (scrollOffset: number) => boolean;
  measureVersion: number;
}

const resolveAlignedOffset = (
  itemTop: number,
  itemSize: number,
  viewportHeight: number,
  align: ConversationVirtualizerAlign,
): number => {
  switch (align) {
    case "end":
      return Math.max(0, itemTop + itemSize - viewportHeight);
    case "center":
      return Math.max(0, itemTop - Math.max(0, viewportHeight - itemSize) / 2);
    case "start":
      return Math.max(0, itemTop);
    case "auto":
    default:
      return Math.max(0, itemTop);
  }
};

export const useTanStackVirtualizedMessages = <Item,>({
  items,
  viewportRef,
  outerRef: providedOuterRef,
  observeViewport = true,
  enabled = true,
  debugLabel,
  overscan = 10,
  estimateItemSize,
  getItemKey,
  getMeasurementKey,
  shouldResetAfterSizeChange,
}: UseTanStackVirtualizedMessagesParams<Item>): UseTanStackVirtualizedMessagesResult => {
  const {
    outerRef,
    viewportHeight,
    getItemSize,
    getItemOffset,
    findItemAtOffset,
    setItemSize: setMeasuredItemSize,
    clearMeasuredSizes: clearMeasuredSizesBase,
    resetMeasurements: resetMeasurementsBase,
    measureVersion,
  } = useVirtualizedMessages<Item, never>({
    items,
    viewportRef,
    outerRef: providedOuterRef,
    observeViewport,
    enabled,
    debugLabel,
    estimateItemSize,
    getItemKey,
    getMeasurementKey,
    shouldResetAfterSizeChange,
  });
  const pendingProgrammaticScrollRef = React.useRef<{
    offset: number;
    expiresAt: number;
    behavior: ConversationVirtualizerScrollBehavior;
  } | null>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual intentionally returns imperative methods; this hook keeps them local and does not pass them into memoized children.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: items.length,
    enabled,
    getScrollElement: () => outerRef.current,
    estimateSize: (index) => {
      const item = items[index];
      return item ? getItemSize(index) : 0;
    },
    getItemKey: (index) => {
      const item = items[index];
      return item ? getItemKey(item, index) : index;
    },
    overscan,
    useAnimationFrameWithResizeObserver: true,
  });

  const scheduleProgrammaticScroll = React.useCallback((
    offset: number,
    behavior: ConversationVirtualizerScrollBehavior = "auto",
  ) => {
    pendingProgrammaticScrollRef.current = {
      offset: Math.max(0, offset),
      expiresAt: Date.now() + PROGRAMMATIC_SCROLL_TTL_MS,
      behavior,
    };
  }, []);

  const clearMeasuredSizes = React.useCallback(() => {
    clearMeasuredSizesBase();
    if (!enabled) {
      return;
    }
    virtualizer.measure();
  }, [clearMeasuredSizesBase, enabled, virtualizer]);

  const resetMeasurements = React.useCallback(() => {
    resetMeasurementsBase();
    if (!enabled) {
      return;
    }
    virtualizer.measure();
  }, [enabled, resetMeasurementsBase, virtualizer]);

  const setItemSize = React.useCallback(
    (index: number, size: number) => {
      const result = setMeasuredItemSize(index, size);
      if (enabled && result.changed) {
        virtualizer.resizeItem(index, Math.max(1, Math.ceil(size)));
      }
      return result;
    },
    [enabled, setMeasuredItemSize, virtualizer],
  );

  const scrollToOffset = React.useCallback(
    (
      offset: number,
      behavior: ConversationVirtualizerScrollBehavior = "auto",
    ) => {
      if (!enabled) {
        return;
      }
      const nextOffset = Math.max(0, offset);
      scheduleProgrammaticScroll(nextOffset, behavior);
      const outer = outerRef.current;
      if (outer) {
        outer.scrollTo({
          top: nextOffset,
          behavior,
        });
        return;
      }
      virtualizer.scrollToOffset(nextOffset);
    },
    [enabled, outerRef, scheduleProgrammaticScroll, virtualizer],
  );

  const scrollToIndex = React.useCallback(
    (
      index: number,
      align: ConversationVirtualizerAlign = "auto",
      behavior: ConversationVirtualizerScrollBehavior = "auto",
    ) => {
      if (!enabled) {
        return;
      }

      const outer = outerRef.current;
      const itemTop = getItemOffset(index);
      const itemSize = getItemSize(index);
      const viewportSize =
        outer?.clientHeight ?? viewportHeight ?? 0;
      const targetOffset = resolveAlignedOffset(
        itemTop,
        itemSize,
        viewportSize,
        align,
      );
      scheduleProgrammaticScroll(targetOffset, behavior);
      if (outer) {
        outer.scrollTo({
          top: targetOffset,
          behavior,
        });
        return;
      }
      virtualizer.scrollToIndex(index, { align });
    },
    [
      enabled,
      getItemOffset,
      getItemSize,
      outerRef,
      scheduleProgrammaticScroll,
      viewportHeight,
      virtualizer,
    ],
  );

  const measureIndex = React.useCallback(
    (index: number) => {
      if (!enabled) {
        return;
      }
      virtualizer.resizeItem(index, Math.max(1, Math.ceil(getItemSize(index))));
      virtualizer.measure();
    },
    [enabled, getItemSize, virtualizer],
  );

  const consumeProgrammaticScroll = React.useCallback((scrollOffset: number) => {
    const pending = pendingProgrammaticScrollRef.current;
    if (!pending) {
      return false;
    }
    if (Date.now() > pending.expiresAt) {
      pendingProgrammaticScrollRef.current = null;
      return false;
    }
    if (
      Math.abs(scrollOffset - pending.offset) <=
      PROGRAMMATIC_SCROLL_MATCH_THRESHOLD_PX
    ) {
      pendingProgrammaticScrollRef.current = null;
      return true;
    }

    return pending.behavior === "smooth";
  }, []);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }
    virtualizer.measure();
  }, [enabled, items.length, measureVersion, overscan, virtualizer]);

  const virtualItems: ConversationVirtualItem[] = enabled
    ? virtualizer.getVirtualItems().map((virtualItem) => ({
        key: virtualItem.key,
        index: virtualItem.index,
        start: virtualItem.start,
        size: virtualItem.size,
        end: virtualItem.end,
      }))
    : [];

  return {
    outerRef,
    viewportHeight,
    virtualItems,
    totalSize: enabled ? virtualizer.getTotalSize() : 0,
    getItemSize,
    getItemOffset,
    findItemAtOffset,
    setItemSize,
    clearMeasuredSizes,
    resetMeasurements,
    scrollToOffset,
    scrollToIndex,
    measureIndex,
    consumeProgrammaticScroll,
    measureVersion,
  };
};

export default useTanStackVirtualizedMessages;
