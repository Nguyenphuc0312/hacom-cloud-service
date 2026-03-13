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
}: UseVirtualizedMessagesParams<Item, ListData>): UseVirtualizedMessagesResult<ListData> => {
  const fallbackListRef = React.useRef<VirtualList<ListData> | null>(null);
  const fallbackOuterRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = providedListRef ?? fallbackListRef;
  const outerRef = providedOuterRef ?? fallbackOuterRef;
  const sizeMapRef = React.useRef<Map<string, number>>(new Map());
  const [viewportHeight, setViewportHeight] = React.useState(0);

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
      listRef.current?.resetAfterIndex(index);
      return {
        changed: true,
        previousSize: current ?? estimateItemSize(item),
        nextSize: size,
        delta: size - (current ?? estimateItemSize(item)),
      };
    },
    [estimateItemSize, getItemKey, items, listRef],
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

  const clearMeasuredSizes = React.useCallback(() => {
    sizeMapRef.current = new Map();
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
      listRef.current?.resetAfterIndex(0, false);
    }
  }, [getItemKey, items, listRef]);

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
  }, [viewportRef, items.length]);

  return {
    listRef,
    outerRef,
    viewportHeight,
    getItemSize,
    setItemSize,
    clearMeasuredSizes,
    measureVersion: viewportHeight,
  };
};

export default useVirtualizedMessages;
