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

  const getItemOffset = React.useCallback(
    (targetIndex: number): number => {
      let accumulatedHeight = 0;
      for (let index = 0; index < targetIndex; index += 1) {
        accumulatedHeight += Math.max(1, Math.ceil(getItemSize(index)));
      }
      return accumulatedHeight;
    },
    [getItemSize],
  );

  const findItemAtOffset = React.useCallback(
    (scrollOffset: number) => {
      if (items.length === 0) return null;

      let accumulatedHeight = 0;
      let targetIndex = 0;

      for (let index = 0; index < items.length; index += 1) {
        const rowHeight = Math.max(1, Math.ceil(getItemSize(index)));
        if (accumulatedHeight + rowHeight > scrollOffset + 1) {
          targetIndex = index;
          break;
        }

        accumulatedHeight += rowHeight;
        targetIndex = index;
      }

      if (!items[targetIndex]) {
        return null;
      }

      return {
        index: targetIndex,
        offsetWithinItem: Math.max(0, scrollOffset - accumulatedHeight),
      };
    },
    [getItemSize, items],
  );

  const clearMeasuredSizes = React.useCallback(() => {
    sizeMapRef.current = new Map();
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
