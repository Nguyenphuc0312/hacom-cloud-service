import React from "react";
import type { VariableSizeList as VirtualList } from "react-window";
import type {
  ConversationVirtualizerAlign,
  ConversationVirtualizerMeasurementResult,
  ConversationVirtualizerOffsetMatch,
  ConversationVirtualizerScrollBehavior,
} from "./virtualizerContract";
import { logMessageDebug } from "../utils/messageDebug";

const ITEM_SIZE_CHANGE_THRESHOLD = 2;
const PROGRAMMATIC_SCROLL_MATCH_THRESHOLD_PX = 12;
const PROGRAMMATIC_SCROLL_TTL_MS = 450;

interface UseVirtualizedMessagesParams<Item, ListData> {
  items: Item[];
  viewportRef: React.RefObject<HTMLDivElement | null>;
  observeViewport?: boolean;
  debugLabel?: string;
  enabled?: boolean;
  estimateItemSize: (item: Item) => number;
  getItemKey: (item: Item, index: number) => string;
  getMeasurementKey?: (item: Item, index: number) => string;
  shouldResetAfterSizeChange?: (item: Item, index: number) => boolean;
  listRef?: React.MutableRefObject<VirtualList<ListData> | null>;
  outerRef?: React.MutableRefObject<HTMLDivElement | null>;
}

interface UseVirtualizedMessagesResult<ListData> {
  listRef: React.MutableRefObject<VirtualList<ListData> | null>;
  outerRef: React.MutableRefObject<HTMLDivElement | null>;
  viewportHeight: number;
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

export const useVirtualizedMessages = <Item, ListData>({
  items,
  viewportRef,
  observeViewport = true,
  debugLabel,
  enabled = true,
  estimateItemSize,
  getItemKey,
  getMeasurementKey,
  shouldResetAfterSizeChange,
  listRef: providedListRef,
  outerRef: providedOuterRef,
}: UseVirtualizedMessagesParams<
  Item,
  ListData
>): UseVirtualizedMessagesResult<ListData> => {
  const fallbackListRef = React.useRef<VirtualList<ListData> | null>(null);
  const fallbackOuterRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = providedListRef ?? fallbackListRef;
  const outerRef = providedOuterRef ?? fallbackOuterRef;
  const sizeMapRef = React.useRef<Map<string, number>>(new Map());
  const pendingResetIndexRef = React.useRef<number | null>(null);
  // Prefix-sum cache: prefixSum[i] = start offset of item i = sum of heights 0..i-1.
  // prefixSum[0] = 0. Rebuilt lazily; dirtyFrom marks the first stale entry.
  const prefixSumRef = React.useRef<number[]>([]);
  const prefixSumDirtyFromRef = React.useRef<number>(0);
  const pendingResetForceRef = React.useRef(false);
  const resetAfterIndexRafRef = React.useRef<number | null>(null);
  const pendingSizeUpdatesRef = React.useRef<
    Map<
      string,
      {
        index: number;
        key: string;
        size: number;
      }
    >
  >(new Map());
  const flushPendingSizeUpdatesRafRef = React.useRef<number | null>(null);
  const pendingProgrammaticScrollRef = React.useRef<{
    offset: number;
    expiresAt: number;
    behavior: ConversationVirtualizerScrollBehavior;
  } | null>(null);
  const [viewportHeight, setViewportHeight] = React.useState(0);
  const resolveMeasurementKey = React.useCallback(
    (item: Item, index: number) =>
      getMeasurementKey?.(item, index) ?? getItemKey(item, index),
    [getItemKey, getMeasurementKey],
  );

  const scheduleResetAfterIndex = React.useCallback(
    (index: number, shouldForceUpdate = false) => {
      if (!enabled) {
        return;
      }
      pendingResetIndexRef.current =
        pendingResetIndexRef.current === null
          ? index
          : Math.min(pendingResetIndexRef.current, index);
      pendingResetForceRef.current =
        pendingResetForceRef.current || shouldForceUpdate;

      if (resetAfterIndexRafRef.current !== null) {
        return;
      }

      resetAfterIndexRafRef.current = window.requestAnimationFrame(() => {
        const nextIndex = pendingResetIndexRef.current;
        const shouldForce = pendingResetForceRef.current;

        pendingResetIndexRef.current = null;
        pendingResetForceRef.current = false;
        resetAfterIndexRafRef.current = null;

        if (nextIndex === null) return;
        listRef.current?.resetAfterIndex(nextIndex, shouldForce);
      });
    },
    [enabled, listRef],
  );

  const flushPendingSizeUpdates = React.useCallback(() => {
    flushPendingSizeUpdatesRafRef.current = null;

    if (pendingSizeUpdatesRef.current.size === 0) {
      return;
    }

    let minChangedIndex: number | null = null;
    pendingSizeUpdatesRef.current.forEach(({ index, key, size }) => {
      sizeMapRef.current.set(key, size);
      prefixSumDirtyFromRef.current = Math.min(
        prefixSumDirtyFromRef.current,
        index + 1,
      );
      const item = items[index];
      if (
        item &&
        (typeof shouldResetAfterSizeChange !== "function" ||
          shouldResetAfterSizeChange(item, index))
      ) {
        minChangedIndex =
          minChangedIndex === null ? index : Math.min(minChangedIndex, index);
      }
    });
    pendingSizeUpdatesRef.current.clear();

    if (minChangedIndex !== null) {
      listRef.current?.resetAfterIndex(minChangedIndex, false);
    }
  }, [items, listRef, shouldResetAfterSizeChange]);

  const schedulePendingSizeFlush = React.useCallback(() => {
    if (flushPendingSizeUpdatesRafRef.current !== null) {
      return;
    }

    flushPendingSizeUpdatesRafRef.current = window.requestAnimationFrame(
      flushPendingSizeUpdates,
    );
  }, [flushPendingSizeUpdates]);

  const setItemSize = React.useCallback(
    (index: number, size: number) => {
      const item = items[index];
      if (!item) {
        return {
          changed: false,
          previousSize: 0,
          nextSize: size,
          delta: 0,
        };
      }

      const key = resolveMeasurementKey(item, index);
      const pendingUpdate = pendingSizeUpdatesRef.current.get(key);
      const previousSize =
        pendingUpdate?.size ??
        sizeMapRef.current.get(key) ??
        estimateItemSize(item);
      const delta = size - previousSize;

      if (
        previousSize === size ||
        Math.abs(delta) <= ITEM_SIZE_CHANGE_THRESHOLD
      ) {
        return {
          changed: false,
          previousSize,
          nextSize: size,
          delta: 0,
        };
      }

      pendingSizeUpdatesRef.current.set(key, {
        index,
        key,
        size,
      });
      schedulePendingSizeFlush();

      return {
        changed: true,
        previousSize,
        nextSize: size,
        delta,
      };
    },
    [estimateItemSize, items, resolveMeasurementKey, schedulePendingSizeFlush],
  );

  const getItemSize = React.useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return 0;

      const key = resolveMeasurementKey(item, index);
      return sizeMapRef.current.get(key) ?? estimateItemSize(item);
    },
    [estimateItemSize, items, resolveMeasurementKey],
  );

  // Lazily builds (or partially rebuilds) the prefix-sum array.
  // prefixSum[i] = offset of item i = sum of clamped heights for items 0..i-1.
  // Reconstruction starts from prefixSumDirtyFromRef, so append-at-end is O(1).
  const ensurePrefixSumBuilt = React.useCallback((): number[] => {
    const dirtyFrom = prefixSumDirtyFromRef.current;
    const n = items.length;
    const prevArr = prefixSumRef.current;

    if (dirtyFrom > n && prevArr.length === n + 1) return prevArr;

    const arr: number[] =
      prevArr.length === n + 1 ? prevArr : new Array<number>(n + 1);
    if (arr !== prevArr) prefixSumRef.current = arr;

    if (Math.min(dirtyFrom, n) === 0) arr[0] = 0;
    for (let i = Math.max(Math.min(dirtyFrom, n), 1); i <= n; i += 1) {
      const item = items[i - 1];
      if (!item) {
        arr[i] = arr[i - 1];
        continue;
      }
      const key = resolveMeasurementKey(item, i - 1);
      const measured = sizeMapRef.current.get(key);
      const size = measured !== undefined ? measured : estimateItemSize(item);
      arr[i] = arr[i - 1] + Math.max(1, Math.ceil(size));
    }

    prefixSumDirtyFromRef.current = n + 1; // clean
    return arr;
  }, [estimateItemSize, items, resolveMeasurementKey]);

  // O(1): direct prefix-sum lookup after lazy rebuild.
  const getItemOffset = React.useCallback(
    (targetIndex: number): number => {
      if (targetIndex <= 0) return 0;
      const arr = ensurePrefixSumBuilt();
      return arr[Math.min(targetIndex, items.length)] ?? 0;
    },
    [ensurePrefixSumBuilt, items.length],
  );

  // O(log N): binary search on the prefix-sum array.
  const findItemAtOffset = React.useCallback(
    (scrollOffset: number) => {
      if (items.length === 0) return null;

      const arr = ensurePrefixSumBuilt();
      // Find the largest index i such that arr[i] <= scrollOffset.
      let lo = 0;
      let hi = items.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1;
        if (arr[mid] <= scrollOffset) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }

      if (!items[lo]) return null;
      return {
        index: lo,
        offsetWithinItem: Math.max(0, scrollOffset - arr[lo]),
      };
    },
    [ensurePrefixSumBuilt, items],
  );
  const clearMeasuredSizes = React.useCallback(() => {
    sizeMapRef.current = new Map();
    pendingSizeUpdatesRef.current.clear();
    prefixSumRef.current = [];
    prefixSumDirtyFromRef.current = 0;
    if (resetAfterIndexRafRef.current !== null) {
      window.cancelAnimationFrame(resetAfterIndexRafRef.current);
      resetAfterIndexRafRef.current = null;
    }
    if (flushPendingSizeUpdatesRafRef.current !== null) {
      window.cancelAnimationFrame(flushPendingSizeUpdatesRafRef.current);
      flushPendingSizeUpdatesRafRef.current = null;
    }
    pendingResetIndexRef.current = null;
    pendingResetForceRef.current = false;
    listRef.current?.resetAfterIndex(0, true);
  }, [listRef]);

  React.useEffect(() => {
    const nextKeys = new Set(items.map(resolveMeasurementKey));
    let removedAny = false;
    sizeMapRef.current.forEach((_, key) => {
      if (nextKeys.has(key)) return;
      sizeMapRef.current.delete(key);
      removedAny = true;
    });
    if (removedAny) {
      prefixSumDirtyFromRef.current = 0;
      scheduleResetAfterIndex(0, false);
    }
  }, [items, resolveMeasurementKey, scheduleResetAfterIndex]);

  React.useEffect(() => {
    return () => {
      if (resetAfterIndexRafRef.current !== null) {
        window.cancelAnimationFrame(resetAfterIndexRafRef.current);
      }
      if (flushPendingSizeUpdatesRafRef.current !== null) {
        window.cancelAnimationFrame(flushPendingSizeUpdatesRafRef.current);
      }
    };
  }, []);

  const [prevEnabled, setPrevEnabled] = React.useState(enabled);
  const [prevObserve, setPrevObserve] = React.useState(observeViewport);

  if (enabled !== prevEnabled || observeViewport !== prevObserve) {
    setPrevEnabled(enabled);
    setPrevObserve(observeViewport);
    if (!enabled || !observeViewport) {
      setViewportHeight(0);
    }
  }

  React.useLayoutEffect(() => {
    if (!enabled || !observeViewport) {
      return;
    }

    const viewportElement = viewportRef.current;
    if (!viewportElement) {
      logMessageDebug("useVirtualizedMessages", "viewport_measure_waiting", {
        debugLabel,
        itemCount: items.length,
      });
      return;
    }

    const measure = () => {
      const nextHeight =
        viewportElement.clientHeight ||
        Math.round(viewportElement.getBoundingClientRect().height);
      logMessageDebug("useVirtualizedMessages", "viewport_measured", {
        debugLabel,
        itemCount: items.length,
        nextHeight,
      });
      setViewportHeight((previous) =>
        previous === nextHeight ? previous : nextHeight,
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      if (typeof window === "undefined") return;
      window.addEventListener("resize", measure);
      const rafId = window.requestAnimationFrame(measure);
      const timerId = window.setTimeout(measure, 120);

      return () => {
        window.removeEventListener("resize", measure);
        window.cancelAnimationFrame(rafId);
        window.clearTimeout(timerId);
      };
    }

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewportElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [debugLabel, enabled, items.length, observeViewport, viewportRef]);

  const scheduleProgrammaticScroll = React.useCallback(
    (
      offset: number,
      behavior: ConversationVirtualizerScrollBehavior = "auto",
    ) => {
      pendingProgrammaticScrollRef.current = {
        offset: Math.max(0, offset),
        expiresAt: Date.now() + PROGRAMMATIC_SCROLL_TTL_MS,
        behavior,
      };
    },
    [],
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
      listRef.current?.scrollTo(nextOffset);
    },
    [enabled, listRef, outerRef, scheduleProgrammaticScroll],
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
      const targetOffset = resolveAlignedOffset(
        getItemOffset(index),
        getItemSize(index),
        outer?.clientHeight ?? viewportHeight ?? 0,
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
      listRef.current?.scrollToItem(index, align);
    },
    [
      enabled,
      getItemOffset,
      getItemSize,
      listRef,
      outerRef,
      scheduleProgrammaticScroll,
      viewportHeight,
    ],
  );

  const measureIndex = React.useCallback(
    (index: number) => {
      if (!enabled) {
        return;
      }
      listRef.current?.resetAfterIndex(index, false);
    },
    [enabled, listRef],
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

    const reachedTarget =
      Math.abs(scrollOffset - pending.offset) <=
      PROGRAMMATIC_SCROLL_MATCH_THRESHOLD_PX;

    if (reachedTarget) {
      pendingProgrammaticScrollRef.current = null;
      return true;
    }

    return pending.behavior === "smooth";
  }, []);

  return {
    listRef,
    outerRef,
    viewportHeight,
    getItemSize,
    getItemOffset,
    findItemAtOffset,
    setItemSize,
    clearMeasuredSizes,
    resetMeasurements: clearMeasuredSizes,
    scrollToOffset,
    scrollToIndex,
    measureIndex,
    consumeProgrammaticScroll,
    measureVersion: viewportHeight,
  };
};

export default useVirtualizedMessages;
