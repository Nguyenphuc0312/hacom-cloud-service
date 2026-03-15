import React from "react";
import type { VariableSizeList as VirtualList } from "react-window";

interface UseVirtualizedMessagesParams<Item, ListData> {
  items: Item[];
  viewportRef: React.RefObject<HTMLDivElement | null>;
  estimateItemSize: (item: Item) => number;
  getItemKey: (item: Item, index: number) => string;
  listRef?: React.MutableRefObject<VirtualList<ListData> | null>;
  outerRef?: React.MutableRefObject<HTMLDivElement | null>;
}

interface UseVirtualizedMessagesResult<ListData> {
  listRef: React.MutableRefObject<VirtualList<ListData> | null>;
  outerRef: React.MutableRefObject<HTMLDivElement | null>;
  viewportHeight: number;
  getItemSize: (index: number) => number;
  getItemOffset: (index: number) => number;
  findItemAtOffset: (scrollOffset: number) => {
    index: number;
    offsetWithinItem: number;
  } | null;
  setItemSize: (
    index: number,
    size: number,
  ) => {
    changed: boolean;
    previousSize: number;
    nextSize: number;
    delta: number;
  };
  clearMeasuredSizes: () => void;
  measureVersion: number;
}

export const useVirtualizedMessages = <Item, ListData>({
  items,
  viewportRef,
  estimateItemSize,
  getItemKey,
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
  const [viewportHeight, setViewportHeight] = React.useState(0);

  const scheduleResetAfterIndex = React.useCallback(
    (index: number, shouldForceUpdate = false) => {
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
    [listRef],
  );

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

      const key = getItemKey(item, index);
      const current = sizeMapRef.current.get(key);
      if (current === size || Math.abs((current || 0) - size) <= 1) {
        return {
          changed: false,
          previousSize: current ?? size,
          nextSize: size,
          delta: 0,
        };
      }

      sizeMapRef.current.set(key, size);
      scheduleResetAfterIndex(index);
      prefixSumDirtyFromRef.current = Math.min(
        prefixSumDirtyFromRef.current,
        index + 1,
      );
      return {
        changed: true,
        previousSize: current ?? estimateItemSize(item),
        nextSize: size,
        delta: size - (current ?? estimateItemSize(item)),
      };
    },
    [estimateItemSize, getItemKey, items, scheduleResetAfterIndex],
  );

  const getItemSize = React.useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return 0;

      const key = getItemKey(item, index);
      return sizeMapRef.current.get(key) ?? estimateItemSize(item);
    },
    [estimateItemSize, getItemKey, items],
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
      const key = getItemKey(item, i - 1);
      const measured = sizeMapRef.current.get(key);
      const size = measured !== undefined ? measured : estimateItemSize(item);
      arr[i] = arr[i - 1] + Math.max(1, Math.ceil(size));
    }

    prefixSumDirtyFromRef.current = n + 1; // clean
    return arr;
  }, [estimateItemSize, getItemKey, items]);

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
    prefixSumRef.current = [];
    prefixSumDirtyFromRef.current = 0;
    if (resetAfterIndexRafRef.current !== null) {
      window.cancelAnimationFrame(resetAfterIndexRafRef.current);
      resetAfterIndexRafRef.current = null;
    }
    pendingResetIndexRef.current = null;
    pendingResetForceRef.current = false;
    listRef.current?.resetAfterIndex(0, true);
  }, [listRef]);

  React.useEffect(() => {
    const nextKeys = new Set(items.map(getItemKey));
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
  }, [getItemKey, items, scheduleResetAfterIndex]);

  React.useEffect(() => {
    return () => {
      if (resetAfterIndexRafRef.current !== null) {
        window.cancelAnimationFrame(resetAfterIndexRafRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

    const measure = () => {
      const nextHeight =
        viewportElement.clientHeight ||
        Math.round(viewportElement.getBoundingClientRect().height);
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
    // SCROLL-09: items.length was previously in deps, causing the ResizeObserver to
    // disconnect and reconnect on every message arrival. Viewport height is independent
    // of item count; the observer handles all subsequent size changes automatically.
  }, [viewportRef]);

  return {
    listRef,
    outerRef,
    viewportHeight,
    getItemSize,
    getItemOffset,
    findItemAtOffset,
    setItemSize,
    clearMeasuredSizes,
    measureVersion: viewportHeight,
  };
};

export default useVirtualizedMessages;
