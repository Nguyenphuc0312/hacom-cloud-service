import React from "react";
import type { VariableSizeList as VirtualList } from "react-window";

interface UseVirtualizedMessagesParams<Item> {
  items: Item[];
  viewportRef: React.RefObject<HTMLDivElement | null>;
  estimateItemSize: (item: Item) => number;
}

interface UseVirtualizedMessagesResult<ListData> {
  listRef: React.MutableRefObject<VirtualList<ListData> | null>;
  outerRef: React.MutableRefObject<HTMLDivElement | null>;
  viewportHeight: number;
  getItemSize: (index: number) => number;
  setItemSize: (index: number, size: number) => void;
  clearMeasuredSizes: () => void;
  measureVersion: number;
}

export const useVirtualizedMessages = <Item, ListData>({
  items,
  viewportRef,
  estimateItemSize,
}: UseVirtualizedMessagesParams<Item>): UseVirtualizedMessagesResult<ListData> => {
  const listRef = React.useRef<VirtualList<ListData> | null>(null);
  const outerRef = React.useRef<HTMLDivElement | null>(null);
  const sizeMapRef = React.useRef<Record<number, number>>({});
  const [viewportHeight, setViewportHeight] = React.useState(0);

  const setItemSize = React.useCallback((index: number, size: number) => {
    const current = sizeMapRef.current[index];
    if (current === size || Math.abs((current || 0) - size) <= 1) {
      return;
    }

    sizeMapRef.current[index] = size;
    listRef.current?.resetAfterIndex(index);
  }, []);

  const getItemSize = React.useCallback(
    (index: number) => sizeMapRef.current[index] ?? estimateItemSize(items[index]),
    [estimateItemSize, items],
  );

  const clearMeasuredSizes = React.useCallback(() => {
    sizeMapRef.current = {};
    listRef.current?.resetAfterIndex(0, true);
  }, []);

  React.useEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

    const measure = () => {
      setViewportHeight(viewportElement.clientHeight);
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewportElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [viewportRef]);

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
